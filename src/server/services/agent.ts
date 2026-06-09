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

/** Per-session 锁：确保同一 session 的 Agent 操作串行化，防止 TOCTOU 竞态 */
const sessionLocks = new Map<string, Promise<any>>();

/**
 * 获取 per-session 锁，确保同一 session 的操作串行执行
 * 后一个调用会等待前一个完成后才开始，防止 getOrCreateAgent + prompt 并发
 */
export async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(sessionId) || Promise.resolve();
  const current = prev.then(fn, fn);
  sessionLocks.set(sessionId, current);
  try {
    return await current;
  } finally {
    // 只有当前 promise 仍是锁链末尾时才清理，避免删除后续调用的锁
    if (sessionLocks.get(sessionId) === current) {
      sessionLocks.delete(sessionId);
    }
  }
}

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

/** Debug 事件回调类型 */
export interface DebugCallbacks {
  onDebugEvent: (type: string, data: any) => void;
}

/** 活跃的 Agent 实例映射（sessionId → Agent） */
const agents = new Map<string, Agent>();

/** 默认历史消息截断上限（按 token 估算） */
const DEFAULT_MAX_CONTEXT_TOKENS = 50000;

/**
 * 估算单条消息的 token 数
 * 中文约 2-3 token/字，英文约 0.75 token/word，取 1/3 作为粗略估算
 */
function estimateMessageTokens(msg: any): number {
  const content = msg?.content;
  if (typeof content === "string") {
    return Math.ceil(content.length / 3);
  }
  if (Array.isArray(content)) {
    let total = 0;
    for (const block of content) {
      if (block.type === "text" && block.text) {
        total += Math.ceil(block.text.length / 3);
      } else if (block.type === "thinking" && (block.thinking || block.text)) {
        total += Math.ceil((block.thinking || block.text).length / 3);
      } else if (block.type === "toolResult" && block.result) {
        const resultText = typeof block.result === "string"
          ? block.result
          : JSON.stringify(block.result);
        total += Math.ceil(resultText.length / 3);
      } else if (block.type === "toolCall" && block.arguments) {
        total += Math.ceil(JSON.stringify(block.arguments).length / 3);
      }
    }
    return total;
  }
  return 10; // 兜底
}

/**
 * 截断历史消息，按 token 预算控制上下文大小
 * 策略：
 *   1. 从最新消息往旧方向累加 token
 *   2. 优先丢弃旧的 toolResult 消息（体积大、时效性低）
 *   3. 丢弃 toolResult 时，用摘要替换（保留文件路径，避免 Agent 完全忘记读过该文件）
 *   4. 保证不切断 turn 边界（从 user 消息开始）
 *   5. 至少保留最近一个完整 turn
 */
function truncateMessages(messages: any[], maxTokens: number): any[] {
  if (messages.length === 0) return messages;

  // 先快速估算总 token
  let totalTokens = 0;
  for (const msg of messages) {
    totalTokens += estimateMessageTokens(msg);
  }

  if (totalTokens <= maxTokens) return messages;

  getLogger().info("agent", `历史消息 token 超限：${totalTokens} > ${maxTokens}，开始截断`);

  // 深拷贝消息数组（避免修改原始数据）
  const workingMessages = messages.map((msg) => ({ ...msg }));
  let currentTokens = totalTokens;

  // 第一轮：优先压缩旧的 toolResult 消息（体积大、时效性低）
  // 用摘要替换完整内容，保留文件路径等关键信息
  for (let i = 0; i < workingMessages.length - 1; i++) {
    if (currentTokens <= maxTokens) break;
    const msg = workingMessages[i];

    // 检查是否是 toolResult 消息
    const isToolResult = msg?.role === "tool" ||
      (Array.isArray(msg?.content) && msg.content.some((b: any) => b.type === "toolResult"));

    if (isToolResult) {
      const oldTokens = estimateMessageTokens(msg);

      // 尝试从前面的 assistant 消息中提取工具调用信息（文件路径等）
      const toolSummary = extractToolSummary(i, workingMessages);

      // 用摘要替换完整内容
      if (Array.isArray(msg.content)) {
        msg.content = msg.content.map((block: any) => {
          if (block.type === "toolResult") {
            return {
              ...block,
              result: toolSummary,
            };
          }
          return block;
        });
      } else if (typeof msg.content === "string") {
        msg.content = toolSummary;
      }

      const newTokens = estimateMessageTokens(msg);
      currentTokens -= (oldTokens - newTokens);
    }
  }

  // 第二轮：如果仍然超限，从旧到新丢弃完整 turn（从 user 消息开始）
  if (currentTokens > maxTokens) {
    // 标记哪些消息保留
    const keep = new Array(workingMessages.length).fill(true);

    // 找到所有 user 消息的位置（turn 起点）
    const turnStarts: number[] = [];
    for (let i = 0; i < workingMessages.length; i++) {
      if (workingMessages[i]?.role === "user" && keep[i]) {
        turnStarts.push(i);
      }
    }

    // 从最旧的 turn 开始丢弃
    for (const turnStart of turnStarts) {
      if (currentTokens <= maxTokens) break;

      const nextTurnStart = turnStarts.find((t) => t > turnStart) ?? workingMessages.length;

      let turnTokens = 0;
      for (let i = turnStart; i < nextTurnStart; i++) {
        if (keep[i]) {
          turnTokens += estimateMessageTokens(workingMessages[i]);
        }
      }

      for (let i = turnStart; i < nextTurnStart; i++) {
        keep[i] = false;
      }
      currentTokens -= turnTokens;
    }

    return workingMessages.filter((_, i) => keep[i]);
  }

  const dropped = messages.length - workingMessages.length;
  if (dropped > 0 || currentTokens < totalTokens) {
    getLogger().info("agent", `历史消息截断：保留 ${workingMessages.length} 条（${currentTokens} tokens，上限 ${maxTokens}）`);
  }

  return workingMessages;
}

/**
 * 从工具调用上下文中提取摘要信息（工具名、文件路径等）
 * 用于替换被压缩的 toolResult，让 Agent 至少知道"读过什么文件"
 */
function extractToolSummary(toolResultIndex: number, messages: any[]): string {
  // 从 toolResult 中提取 toolCallId（用于匹配对应的 toolCall）
  const toolResultMsg = messages[toolResultIndex];
  const toolResultBlocks = Array.isArray(toolResultMsg?.content)
    ? toolResultMsg.content.filter((b: any) => b.type === "toolResult")
    : [];
  const toolCallIds = new Set(toolResultBlocks.map((b: any) => b.toolCallId).filter(Boolean));

  // 往前找最近的 assistant 消息中的 toolCall
  for (let i = toolResultIndex - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;

    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const block of content) {
      if (block.type !== "toolCall") continue;

      // 通过 toolCallId 匹配对应的 toolCall（并行工具调用时有多个 toolCall）
      const blockId = block.toolCallId || block.id;
      if (toolCallIds.size > 0 && blockId && !toolCallIds.has(blockId)) continue;

      const toolName = block.toolName || block.name || "";
      const args = block.arguments || {};

      // 根据工具类型生成摘要
      if (toolName === "read_file") {
        return `[已读取文件: ${args.path || "未知路径"}，内容已被压缩]`;
      }
      if (toolName === "write_file") {
        return `[已写入文件: ${args.path || "未知路径"}]`;
      }
      if (toolName === "edit_file") {
        return `[已编辑文件: ${args.path || "未知路径"}]`;
      }
      if (toolName === "list_directory") {
        return `[已列出目录: ${args.path || "未知路径"}]`;
      }
      if (toolName === "grep") {
        return `[已搜索: pattern="${args.pattern}", path="${args.path || ""}"]`;
      }
      if (toolName === "bash") {
        const cmd = typeof args.command === "string" ? args.command.slice(0, 100) : "";
        return `[已执行命令: ${cmd}]`;
      }
      return `[已执行工具: ${toolName}]`;
    }
    break; // 只看最近的 assistant 消息
  }
  return "[工具结果已被压缩]";
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
  systemPrompt?: string,
  debug?: DebugCallbacks
): Promise<{ agent: Agent; historyCount: number }> {
  const existing = agents.get(sessionId);
  if (existing) {
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
  const maxContextTokens = config.context.max_context_tokens || DEFAULT_MAX_CONTEXT_TOKENS;
  historyMessages = truncateMessages(historyMessages, maxContextTokens);

  // 使用配置的 thinking level；模型不支持 thinking 时降级为 off
  let thinkingLevel = config.llm.thinking_level || "off";
  if (thinkingLevel !== "off" && !model.reasoning) {
    getLogger().warn("agent", `模型 ${model.id} 不支持 thinking，自动降级为 off`);
    thinkingLevel = "off";
  }

  // Debug: 捕获 system prompt
  if (debug) {
    const sp = systemPrompt || loadSystemPrompt();
    debug.onDebugEvent("debug_system_prompt", {
      systemPrompt: sp,
      length: sp.length,
    });
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
    // 请求 payload 日志 + debug 事件
    onPayload: (params: any) => {
      getLogger().info("llm", `请求 payload model=${params.model}, messages=${params.messages?.length || 0} 条`, { sessionId });
      // Debug: 捕获完整 LLM 请求 payload
      if (debug) {
        debug.onDebugEvent("debug_payload", {
          model: params.model,
          messageCount: params.messages?.length || 0,
          messages: params.messages,
          toolCount: params.tools?.length || 0,
          tools: params.tools,
        });
      }
      return params;
    },
    // Debug: 捕获 LLM 响应
    onResponse: debug
      ? (response: any) => {
          debug.onDebugEvent("debug_response", {
            status: response.status,
            headers: response.headers,
          });
        }
      : undefined,
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

/** 获取所有活跃 Agent 实例（供配置热更新使用） */
export function getAllAgents(): Map<string, Agent> {
  return agents;
}

/**
 * 从 Agent 当前状态估算 context token 数
 * 当 llm-tracker 中没有 API 返回的 inputTokens 时，用此函数兜底
 * 注意：text.length / 3 是粗略估算（中文约 2-3 token/字，英文约 0.75 token/word）
 * 实际 token 数以 LLM API 返回的 inputTokens 为准
 */
export function estimateContextTokens(sessionId: string): number | null {
  const agent = agents.get(sessionId);
  if (!agent) return null;
  let tokens = 0;
  if (agent.state.systemPrompt) {
    tokens += Math.ceil(agent.state.systemPrompt.length / 3);
  }
  for (const msg of agent.state.messages) {
    const m = msg as any;
    const text = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map((b: any) => b.text || b.thinking || JSON.stringify(b.arguments || "")).join("")
        : "";
    tokens += Math.ceil(text.length / 3);
  }
  return tokens;
}
