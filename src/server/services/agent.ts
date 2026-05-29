/**
 * Agent 服务：管理 Agent 实例的生命周期
 * 每个 Session 对应一个 Agent 实例
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { getConfig } from "./config.js";
import { getLogger } from "./logger.js";
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

/**
 * 获取或创建 Agent 实例
 */
export function getOrCreateAgent(
  sessionId: string,
  model: Model<any>,
  systemPrompt?: string
): Agent {
  const existing = agents.get(sessionId);
  if (existing) {
    // 模型热切换：如果模型变了，更新 Agent 的 model
    if (existing.state.model?.id !== model.id) {
      existing.state.model = model;
    }
    return existing;
  }


  const config = getConfig();
  const apiKey = config.llm.api_key;

  // 使用配置的 thinking level；模型不支持 thinking 时降级为 off
  let thinkingLevel = config.llm.thinking_level || "off";
  if (thinkingLevel !== "off" && !model.reasoning) {
    getLogger().warn("agent", `模型 ${model.id} 不支持 thinking，自动降级为 off`);
    thinkingLevel = "off";
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt || loadSystemPrompt(),
      model,
      tools: tools as any,
      thinkingLevel,
    },
    getApiKey: () => apiKey,
    toolExecution: "parallel",
  });

  agents.set(sessionId, agent);
  return agent;
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
