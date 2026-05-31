/**
 * 终端对话核心逻辑
 * 直连 pi-ai stream()，不经 Express，事件直接渲染到终端
 */
import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AppConfig, ModelDef } from "../../server/services/config.js";
import { getModelById, listModels } from "../../server/services/config.js";
import { createSession, openSession, updateSession } from "../../server/services/session.js";
import { tools } from "../../server/tools/index.js";
import { success, error, warn, dim, bold, cyan } from "./format.js";

/** chat 配置选项 */
export interface ChatOptions {
  message?: string;        // 单次对话消息（不传则交互模式）
  sessionId?: string;      // 恢复已有 session
  modelId?: string;        // 指定模型
}

/** 从 AGENT.md 加载系统提示词 */
function loadSystemPrompt(): string {
  const agentMd = resolve(process.cwd(), "AGENT.md");
  if (existsSync(agentMd)) {
    const content = readFileSync(agentMd, "utf-8").trim();
    if (content) return content;
  }
  return "你是一个有用的 AI 助手。请用中文回答。";
}

/**
 * 从 JSONL 文件加载历史消息，注入到 Agent
 */
async function loadHistoryMessages(sessionId: string, agent: Agent): Promise<number> {
  try {
    const session = await openSession(sessionId);
    if (!session) return 0;

    // 读取 JSONL 文件
    const metadata = await session.getMetadata() as any;
    const jsonlPath = metadata.path;
    if (!jsonlPath || !existsSync(jsonlPath)) return 0;

    const content = readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n");
    let count = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "message" && entry.message) {
          const msg = entry.message;
          // 只加载 user 和 assistant 消息（toolResult 由 Agent 内部管理）
          if (msg.role === "user" || msg.role === "assistant") {
            agent.state.messages.push(msg);
            count++;
          }
        }
      } catch {
        // 跳过解析失败的行
      }
    }

    return count;
  } catch {
    return 0;
  }
}

/**
 * 渲染 Agent 事件到终端
 */
function createEventRenderer(): (event: AgentEvent) => void {
  let inThinking = false;
  let inToolCall = false;

  return (event: AgentEvent) => {
    if (event.type === "message_update") {
      const ae = (event as any).assistantMessageEvent;
      if (!ae) return;

      switch (ae.type) {
        case "thinking_start":
          process.stdout.write(dim("\n[Thinking] "));
          inThinking = true;
          break;
        case "thinking_delta":
          process.stdout.write(dim(ae.delta));
          break;
        case "thinking_end":
          process.stdout.write("\n");
          inThinking = false;
          break;
        case "text_start":
          if (inThinking) {
            process.stdout.write("\n");
            inThinking = false;
          }
          break;
        case "text_delta":
          process.stdout.write(ae.delta);
          break;
        case "text_end":
          process.stdout.write("\n");
          break;
        case "toolcall_start":
          inToolCall = true;
          break;
        case "toolcall_end":
          inToolCall = false;
          break;
      }
    }

    if (event.type === "tool_execution_start") {
      const name = event.toolName;
      const args = event.args;
      const argsStr = typeof args === "object" ? JSON.stringify(args) : String(args);
      const truncated = argsStr.length > 100 ? argsStr.slice(0, 100) + "..." : argsStr;
      console.log(cyan(`\n[Tool: ${name}] ${truncated}`));
    }

    if (event.type === "tool_execution_end") {
      const isError = event.isError;
      if (isError) {
        console.log(error("[Tool 执行失败]"));
      } else {
        console.log(success("[Tool 完成]"));
      }
    }

    if (event.type === "message_end") {
      const msg = (event as any).message;
      if (msg?.stopReason === "error" && msg?.errorMessage) {
        console.log(error(`\n[错误] ${msg.errorMessage}`));
      }
    }
  };
}

/**
 * 运行终端对话
 */
export async function runChat(options: ChatOptions, config: AppConfig): Promise<void> {
  const modelId = options.modelId;
  const model = getModelById(modelId);

  // 获取 API Key
  const apiKey = config.llm.api_key;

  // Thinking level
  let thinkingLevel = config.llm.thinking_level || "off";
  if (thinkingLevel !== "off" && !model.reasoning) {
    thinkingLevel = "off";
  }

  // 创建或恢复 session
  let sessionId = options.sessionId;
  let sessionMeta = null;

  if (sessionId) {
    // 恢复已有 session — 通过 openSession 验证存在
    const session = await openSession(sessionId);
    if (!session) {
      console.log(error(`Session 不存在: ${sessionId}`));
      process.exit(1);
    }
    const metadata = await session.getMetadata();
    sessionMeta = { id: sessionId, title: sessionId.slice(0, 8) };
    console.log(dim(`恢复 Session: ${sessionId.slice(0, 8)}...`));
  } else {
    // 创建新 session
    const meta = await createSession("CLI 对话", model.id);
    sessionId = meta.id;
    sessionMeta = meta;
    console.log(dim(`新 Session: ${sessionId.slice(0, 8)}...`));
  }

  // 创建 Agent
  const agent = new Agent({
    initialState: {
      systemPrompt: loadSystemPrompt(),
      model,
      tools: tools as any,
      thinkingLevel: thinkingLevel as any,
    },
    getApiKey: () => apiKey,
    toolExecution: "parallel",
  });

  // 加载历史消息（恢复 session 时）
  if (options.sessionId) {
    const count = await loadHistoryMessages(options.sessionId, agent);
    if (count > 0) {
      console.log(dim(`已加载 ${count} 条历史消息`));
    }
  }

  // 订阅事件
  const unsubscribe = agent.subscribe(createEventRenderer());

  // 打开 session 用于持久化
  const session = await openSession(sessionId);

  // 持久化消息
  const persistMessage = async (msg: any) => {
    if (!session || !msg) return;
    try {
      await session.appendMessage(msg);
    } catch {
      // 忽略持久化失败
    }
  };

  // 单次对话模式
  if (options.message) {
    await agent.prompt(options.message);
    await agent.waitForIdle();

    // 持久化
    for (const msg of agent.state.messages) {
      await persistMessage(msg);
    }

    // 更新 session 元数据
    updateSession(sessionId, {
      messageCount: agent.state.messages.length,
      modelId: model.id,
    });

    unsubscribe();
    return;
  }

  // 交互模式
  console.log(bold("\n🐕 Doudou Agent v0.1.0") + dim(" (输入 /exit 退出, /clear 清屏, /model 切换模型)"));
  console.log(dim(`模型: ${model.id} | Thinking: ${thinkingLevel}\n`));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: bold("> "),
  });

  const promptUser = () => {
    rl.prompt();
  };

  promptUser();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) {
      promptUser();
      return;
    }

    // 斜杠命令
    if (input.startsWith("/")) {
      const [cmd, ...args] = input.split(/\s+/);

      switch (cmd.toLowerCase()) {
        case "/exit":
        case "/quit":
          console.log(dim("\n再见！🐕"));
          unsubscribe();
          rl.close();
          process.exit(0);
          break;

        case "/clear":
          console.clear();
          promptUser();
          return;

        case "/model": {
          const newModelId = args[0];
          if (!newModelId) {
            const models = listModels();
            console.log(dim("可用模型:"));
            for (const m of models) {
              const marker = m.id === model.id ? success(" ← 当前") : "";
              console.log(dim(`  ${m.id}${marker}`));
            }
            promptUser();
            return;
          }
          try {
            const newModel = getModelById(newModelId);
            agent.state.model = newModel;
            if (!newModel.reasoning) {
              agent.state.thinkingLevel = "off" as any;
            }
            console.log(success(`✓ 已切换到 ${newModelId}`));
          } catch (err: any) {
            console.log(error(err.message));
          }
          promptUser();
          return;
        }

        case "/session":
          console.log(dim(`Session ID: ${sessionId}`));
          console.log(dim(`消息数: ${agent.state.messages.length}`));
          promptUser();
          return;

        case "/help":
          console.log(dim("命令:"));
          console.log(dim("  /exit, /quit    退出对话"));
          console.log(dim("  /clear          清屏"));
          console.log(dim("  /model [id]     查看/切换模型"));
          console.log(dim("  /session        显示 session 信息"));
          console.log(dim("  /help           显示帮助"));
          promptUser();
          return;

        default:
          console.log(warn(`未知命令: ${cmd}，输入 /help 查看帮助`));
          promptUser();
          return;
      }
    }

    // 发送消息
    try {
      await agent.prompt(input);
      await agent.waitForIdle();

      // 持久化新消息
      for (const msg of agent.state.messages) {
        await persistMessage(msg);
      }

      // 更新 session
      updateSession(sessionId, {
        messageCount: agent.state.messages.length,
        modelId: (agent.state.model as any)?.id || model.id,
      });
    } catch (err: any) {
      console.log(error(`\n${err.message}`));
    }

    console.log(""); // 空行分隔
    promptUser();
  });

  rl.on("close", () => {
    unsubscribe();
    process.exit(0);
  });
}
