/**
 * 前端类型定义
 */

/** Session 元数据 */
export interface SessionMeta {
  id: string;
  title: string;
  modelId: string;
  cwd: string;
  jsonlPath: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** LLM 配置 */
export interface LLMConfig {
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  temperature?: number;
  max_tokens?: number;
}

/** 完整配置 */
export interface AppConfig {
  llm: LLMConfig;
  server: { port: number };
}

/** 模型定义 */
export interface ModelDef {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
}

/** 聊天消息类型 */
export type ChatMessageType = "user" | "assistant" | "thinking" | "tool";

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  type: ChatMessageType;
  content: string;
  thinking?: string;
  toolCalls?: ToolCallInfo[];
  timestamp: number;
}

/** 工具调用信息 */
export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
  status: "running" | "done" | "error";
  isError?: boolean;
}

/** SSE 事件类型 */
export type SSEEventType =
  | "text_delta"
  | "thinking_delta"
  | "thinking_start"
  | "thinking_end"
  | "text_start"
  | "text_end"
  | "tool_start"
  | "tool_end"
  | "tool_delta"
  | "tool_exec_start"
  | "tool_exec_end"
  | "tool_exec_update"
  | "done"
  | "error"
  | "heartbeat";
