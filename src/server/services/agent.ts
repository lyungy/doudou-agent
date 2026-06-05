/**
 * Agent 服务：管理 Agent 实例的生命周期
 * 每个 Session 对应一个 Agent 实例
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { getConfig, getModelById, getApiKeyByModelId } from "./config.js";
import { getLogger } from "./logger.js";
import { getLLMTracker } from "./llm-tracker.js";
import { tools } from "../tools/index.js";

/** 默认系统提示词 */
const DEFAULT_SYSTEM_PROMPT = "你是一个有用的 AI 助手。请用中文回答。";

/** 加载 AGENT.md 作为系统提示词 */
function loadSystemPrompt(): string {
  const agentMd = resolve(process.cwd(), "AGENT.md");
  if (existsSync(agentMd)) {
    const content = readFileSync(agentMd, "utf-8").trim();
    if (content) {
      getLogger().info("agent", "已加载 AGENT.md 作为系统提示词");
      return content;
    }
  }
  return DEFAULT_SYSTEM_PROMPT;
}

/** 活跃的 Agent 实例映射（sessionId → Agent） */
const agents = new Map<string, Agent>();

/** 默认历史消息截断上限 */
const DEFAULT_MAX_MESSAGES = 100;

/**
 * 截断历史消息，保留最近 maxMessages 条，不切断 turn 边界
 * 一个 turn 从 user 消息开始，截断时往前找最近的 user 消息作为起点
 * 避免出现孤立的 toolResult 或 assistant 消息
 */
function truncateMessages(messages: any[], maxMessages: number): any[] {
  if (messages.length <= maxMessages) return messages;

  // 从截断位置往前找最近的 user 消息作为起点
  const cutoff = messages.length - maxMessages;
  let start = cutoff;
  while (start > 0 && messages[start]?.role !== "user") {
    start--;
  }

  const dropped = start;
  if (dropped > 0) {
    getLogger().info("agent", `历史消息截断：丢弃 ${dropped} 条，保留 ${messages.length - dropped} 条（上限 ${maxMessages}）`);
  }

  return messages.slice(start);
}

/**
 * 供任务调度器使用：创建独立 Agent 并执行
 * 不缓存实例，执行完后由调用方决定是否清理
 */
export async function getAgent(sessionId: string, modelId?: string): Promise<Agent> {
  const model = getModelById(modelId);
  const { agent } = await getOrCreateAgent(sessionId, model);
  return agent;
}

/**
 * 获取或创建 Agent 实例（异步：首次创建时加载 JSONL 历史消息）
 * 返回 agent 实例和历史消息数量（用于持久化时区分历史/新增消息）
 */
export async function getOrCreateAgent(
  sessionId: string,
  model: Model<any>,
  systemPrompt?: string
): Promise<{ agent: Agent; historyCount: number }> {
  const existing = agents.get(sessionId);
  if (existing) {
    // 如果旧 Agent 仍在执行中（SSE 断开后后台继续），等它完成后再复用
    // 避免两个 prompt 并发导致消息混乱
    if (existing.state.isStreaming) {
      getLogger().info("agent", `旧 Agent 仍在执行，等待完成后复用`, { sessionId });
      try {
        await existing.waitForIdle();
      } catch {
        // 忽略等待错误
      }
    }

    // 模型热切换：如果模型变了，更新 Agent 的 model
    if (existing.state.model?.id !== model.id) {
      getLogger().info("agent", `模型热切换: ${existing.state.model?.id} → ${model.id}`, { sessionId });
      existing.state.model = model;
    } else {
      getLogger().debug("agent", `Agent 复用，模型不变: ${model.id}`, { sessionId });
    }
    // 复用时 historyCount=0，表示无新增历史需要跳过
    return { agent: existing, historyCount: existing.state.messages.length };
  }

  getLogger().info("agent", `创建新 Agent，模型: ${model.id}`, { sessionId });

  // 从 JSONL 加载历史消息
  let historyMessages: any[] = [];
  try {
    const { openSession } = await import("./session.js");
    const session = await openSession(sessionId);
    if (session) {
      const context = await session.buildContext();
      historyMessages = context.messages || [];
      if (historyMessages.length > 0) {
        getLogger().info("agent", `从 JSONL 加载 ${historyMessages.length} 条历史消息`, { sessionId });
      }
    }
  } catch (err: any) {
    getLogger().warn("agent", `加载历史消息失败: ${err.message}`, { sessionId });
  }

  const config = getConfig();

  // 历史消息截断：防止超长上下文撑爆 LLM context window
  const maxMessages = config.context.max_messages || DEFAULT_MAX_MESSAGES;
  historyMessages = truncateMessages(historyMessages, maxMessages);

  // 使用配置的 thinking level；模型不支持 thinking 时降级为 off
  let thinkingLevel = config.llm.thinking_level || "off";
  if (thinkingLevel !== "off" && !model.reasoning) {
    getLogger().warn("agent", `模型 ${model.id} 不支持 thinking，自动降级为 off`);
    thinkingLevel = "off";
  }

  let agent: Agent;
  agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt || loadSystemPrompt(),
      model,
      tools: tools as any,
      thinkingLevel,
      messages: historyMessages,
    },
    // 动态获取 apiKey：模型切换时 key 也要跟着变
    getApiKey: (): string => getApiKeyByModelId(agent.state.model?.id),
    toolExecution: "parallel",
    // 请求 payload 日志 + 记录 context token 数
    onPayload: (params: any) => {
      getLogger().info("llm", `请求 payload model=${params.model}, messages=${params.messages?.length || 0} 条`, { sessionId });
      // 估算 context token 数（与 pi-ai 内部估算一致：text.length / 4）
      let contextTokens = 0;
      if (params.systemPrompt) contextTokens += Math.ceil(params.systemPrompt.length / 4);
      if (Array.isArray(params.messages)) {
        for (const msg of params.messages) {
          const text = typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.map((b: any) => b.text || b.thinking || JSON.stringify(b.arguments || "")).join("")
              : "";
          contextTokens += Math.ceil(text.length / 4);
        }
      }
      // 写入 llm-tracker
      const tracker = getLLMTracker();
      const active = tracker.getActive().find((rec) => rec.sessionId === sessionId && rec.status === "connecting");
      if (active) {
        (active as any).contextTokens = contextTokens;
      }
      return params;
    },
  });

  agents.set(sessionId, agent);
  return { agent, historyCount: historyMessages.length };
}

/**
 * 中止指定 session 的 Agent
 */
export function abortAgent(sessionId: string): void {
  const agent = agents.get(sessionId);
  if (agent) {
    agent.abort();
  }
}

/**
 * 移除指定 session 的 Agent（释放资源）
 */
export function removeAgent(sessionId: string): void {
  const agent = agents.get(sessionId);
  if (agent) {
    agent.abort();
    agents.delete(sessionId);
  }
}

/**
 * 获取 Agent 状态
 */
export function getAgentState(sessionId: string) {
  const agent = agents.get(sessionId);
  if (!agent) return null;

  return {
    isStreaming: agent.state.isStreaming,
    messageCount: agent.state.messages.length,
    pendingToolCalls: Array.from(agent.state.pendingToolCalls),
  };
}

/**
 * 获取 Agent 实例（供 resume 路由使用，不创建新实例）
 */
export function getAgentForResume(sessionId: string): Agent | null {
  return agents.get(sessionId) || null;
}
