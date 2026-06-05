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
  pinned: number;
  lastMessage?: string;
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
  providerName?: string;  // 所属 provider 名称（如 "MiMo"、"DeepSeek"）
}

/** 提示词模板 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  filePath: string;
  category: string;
  enabled: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  content?: string;  // GET /:id 时返回
}

/** 图片内容（多模态） */
export interface ImageContent {
  type: "image";
  data: string;        // base64
  mimeType: string;    // "image/png" | "image/jpeg"
}

/** 待发送的图片（含预览用本地 URL） */
export interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;   // 本地 blob URL，用于预览
  base64: string;       // 纯 base64（不含 data: 前缀）
  mimeType: string;
}

/** 视图类型 */
export type MainView = "home" | "chat" | "session" | "tasks" | "logs" | "config";

/** 日志子视图 */
export type LogSubView = "system" | "task-runs";

/** 思考等级 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** 聊天消息类型 */
export type ChatMessageType = "user" | "assistant" | "thinking" | "tool";

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  type: ChatMessageType;
  content: string;
  thinking?: string;
  toolCalls?: ToolCallInfo[];
  images?: ImageContent[];  // 多模态图片
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

/** 累计 token 用量 */
export interface CumulativeTokens {
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

/** 日志级别 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 日志模块 */
export type LogModule = "http" | "llm" | "agent" | "sse" | "system";

/** 日志条目 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: LogModule | string;
  message: string;
  meta?: Record<string, any>;
}

/** LLM 请求状态 */
export type LLMRequestStatus = "connecting" | "streaming" | "completed" | "error" | "aborted";

/** LLM 请求记录 */
export interface LLMRequestRecord {
  id: string;
  sessionId: string;
  modelId: string;
  status: LLMRequestStatus;
  startTime: number;
  firstTokenTime?: number;
  endTime?: number;
  duration?: number;
  ttft?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

/** LLM 实时状态数据 */
export interface LLMStatusData {
  status: LLMRequestStatus;
  requestId?: string;
  ttft?: number;
  duration?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
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

/** 任务类型 */
export type TaskType = "once" | "recurring";

/** 执行状态 */
export type RunStatus = "running" | "success" | "failed" | "timeout";

/** 定时任务 */
export interface Task {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  type: TaskType;
  enabled: boolean;
  timeout: number;
  modelId?: string;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
}

/** 任务执行记录 */
export interface TaskRun {
  id: string;
  taskId: string;
  taskName: string;
  sessionId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  error?: string;
  output?: string;
}
