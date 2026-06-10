/**
 * API 请求封装
 */
import type { SessionMeta, AppConfig, ChatMessage, ModelDef, LogEntry, LLMRequestRecord, ThinkingLevel, Task, TaskRun, PromptTemplate, CumulativeTokens } from "../types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "请求失败");
  }

  return res.json();
}

// ============ Session API ============

export async function fetchSessions(q?: string, content?: boolean): Promise<SessionMeta[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (content) params.set("content", "true");
  const qs = params.toString();
  return request(`/sessions${qs ? `?${qs}` : ""}`);
}

export async function createSession(title?: string, modelId?: string): Promise<SessionMeta> {
  return request("/sessions", {
    method: "POST",
    body: JSON.stringify({ title, modelId }),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await request(`/sessions/${id}`, { method: "DELETE" });
}

export async function deleteSessions(ids: string[]): Promise<void> {
  await request("/sessions/batch-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export async function fetchSessionMessages(id: string): Promise<any[]> {
  return request(`/sessions/${id}/messages`);
}

export async function updateSessionModel(id: string, modelId: string): Promise<void> {
  await request(`/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ modelId }),
  });
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  await request(`/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function toggleSessionPin(id: string, pinned: boolean): Promise<void> {
  await request(`/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ pinned: pinned ? 1 : 0 }),
  });
}

// ============ Config API ============

export async function fetchConfig(): Promise<AppConfig> {
  return request("/config");
}

export async function updateConfig(config: Partial<AppConfig>): Promise<any> {
  return request("/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

// ============ Models API ============

export async function fetchModels(): Promise<{ models: ModelDef[]; thinkingLevel: string }> {
  return request("/config/models");
}

// ============ Chat API (SSE) ============

export interface ChatStreamCallbacks {
  onTextDelta: (delta: string) => void;
  onThinkingStart: () => void;
  onThinkingDelta: (delta: string) => void;
  onThinkingEnd: () => void;
  onToolStart: (contentIndex: number) => void;
  onToolEnd: (toolCall: any) => void;
  onToolExecStart: (data: { toolCallId: string; toolName: string; args: any }) => void;
  onToolExecEnd: (data: { toolCallId: string; toolName: string; result: any; isError: boolean }) => void;
  onLLMStatus: (data: { status: string; requestId: string; ttft?: number; duration?: number; inputTokens?: number; outputTokens?: number; error?: string; code?: string }) => void;
  onDone: () => void;
  onError: (error: string, severity?: "recoverable" | "fatal", code?: string) => void;
  onDebugEvent?: (type: string, data: any) => void;
  /** 重连时 catchup：恢复已累积的内容 */
  onCatchup?: (data: { text: string; thinking?: string; toolCalls?: Array<{ id: string; name: string; args: any; status: string }> }) => void;
  /** 重连状态变化 */
  onReconnecting?: (attempt: number, maxRetries: number) => void;
  onReconnected?: () => void;
}

/** SSE 重连配置 */
const RECONNECT_MAX_RETRIES = 3;
const RECONNECT_BASE_DELAY_MS = 2000; // 2s 起步，指数退避

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 消费 SSE 流的通用逻辑
 * 返回流结束的原因，供调用方决定是否重连
 */
async function consumeSSEStream(
  response: Response,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<{ completed: boolean; aborted: boolean; interrupted: boolean }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;
  let receivedError = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按完整事件块（\n\n）分割，避免 event: 和 data: 被 TCP 分包割裂
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const block of parts) {
        if (!block.trim()) continue;

        let eventType = "";
        let dataStr = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6);
          }
        }

        if (!eventType || eventType === "heartbeat" || !dataStr) continue;

        try {
          const data = JSON.parse(dataStr);
          handleSSEEvent(eventType, data, callbacks);
          if (eventType === "done") receivedDone = true;
          if (eventType === "error") receivedError = true;
        } catch {
          // 忽略解析失败的事件
        }
      }
    }

    // 流正常读取完毕（服务端关闭连接）
    // 如果既没收到 done 也没收到 error，说明连接被提前中断
    if (!receivedDone && !receivedError) {
      return { completed: false, aborted: false, interrupted: true };
    }
    return { completed: true, aborted: false, interrupted: false };
  } catch (err: any) {
    // 网络中断（如 ERR_CONNECTION_RESET）或流读取异常
    if (signal?.aborted) {
      return { completed: false, aborted: true, interrupted: false };
    }
    console.warn("[consumeSSEStream] SSE 流读取中断:", err.message);
    return { completed: false, aborted: false, interrupted: true };
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/**
 * 尝试重连到正在流式的 Agent
 * 检测 Agent 状态 → 如果仍在流式则通过 resume 接口继续接收
 * 返回值：true=重连成功，false=Agent 已结束（无需重连）
 */
async function attemptReconnect(
  sessionId: string,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<boolean> {
  // 检测 Agent 是否仍在流式
  const status = await checkChatStatus(sessionId);
  if (!status.streaming) return false;

  // Agent 仍在流式，通过 resume 接口重连
  try {
    await resumeChat(sessionId, {
      onCatchup: (data) => {
        // 恢复已累积的内容到 UI
        callbacks.onCatchup?.(data);
      },
      onTextDelta: callbacks.onTextDelta,
      onThinkingStart: callbacks.onThinkingStart,
      onThinkingDelta: callbacks.onThinkingDelta,
      onThinkingEnd: callbacks.onThinkingEnd,
      onToolExecStart: callbacks.onToolExecStart,
      onToolExecEnd: callbacks.onToolExecEnd,
      onDone: callbacks.onDone,
      onError: (error) => callbacks.onError(error),
    }, signal);
    return true;
  } catch (err: any) {
    // resume 返回 404（Agent 在 checkChatStatus 和 resume 之间完成执行）
    // 这不是真正的错误，而是 Agent 已结束的信号
    if (err.message?.includes("不在流式状态") || err.message?.includes("404")) {
      return false;
    }
    // 其他错误（网络问题等）向上抛出，由重连循环处理重试
    throw err;
  }
}

/**
 * 发送消息并接收 SSE 流
 * 支持自动重连：网络中断时检测 Agent 状态，仍在流式则自动 resume
 */
export async function streamChat(
  sessionId: string,
  message: string,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
  modelId?: string,
  thinkingLevel?: ThinkingLevel,
  images?: Array<{ data: string; mimeType: string }>
): Promise<void> {
  const response = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, modelId, thinkingLevel, images, debug: !!callbacks.onDebugEvent }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || "请求失败");
  }

  const result = await consumeSSEStream(response, callbacks, signal);

  // 流正常结束
  if (result.completed) return;

  // 用户主动中止
  if (result.aborted) return;

  // 流意外中断，尝试自动重连
  if (result.interrupted) {
    for (let attempt = 1; attempt <= RECONNECT_MAX_RETRIES; attempt++) {
      if (signal?.aborted) return;

      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      callbacks.onReconnecting?.(attempt, RECONNECT_MAX_RETRIES);
      console.warn(`[streamChat] SSE 中断，${delay}ms 后尝试重连 (${attempt}/${RECONNECT_MAX_RETRIES})`);
      await sleep(delay);

      if (signal?.aborted) return;

      try {
        const reconnected = await attemptReconnect(sessionId, callbacks, signal);
        if (reconnected) {
          callbacks.onReconnected?.();
          return;
        }
        // Agent 已不在流式，说明已经执行完成（消息已持久化）
        console.info("[streamChat] Agent 已结束，重连终止");
        callbacks.onDone();
        return;
      } catch (err: any) {
        if (signal?.aborted) return;
        console.warn(`[streamChat] 重连失败 (${attempt}/${RECONNECT_MAX_RETRIES}):`, err.message);
        // 最后一次重试失败
        if (attempt === RECONNECT_MAX_RETRIES) {
          callbacks.onError(`连接中断，重连失败: ${err.message}`, "recoverable", "RECONNECT_FAILED");
          return;
        }
      }
    }
  }
}

function handleSSEEvent(type: string, data: any, callbacks: ChatStreamCallbacks) {
  // Debug 事件：统一处理
  if (type.startsWith("debug_")) {
    callbacks.onDebugEvent?.(type, data);
    return;
  }

  switch (type) {
    case "text_delta":
      callbacks.onTextDelta(data.delta);
      break;
    case "thinking_start":
      callbacks.onThinkingStart();
      break;
    case "thinking_delta":
      callbacks.onThinkingDelta(data.delta);
      break;
    case "thinking_end":
      callbacks.onThinkingEnd();
      break;
    case "tool_start":
      callbacks.onToolStart(data.contentIndex);
      break;
    case "tool_end":
      callbacks.onToolEnd(data.toolCall);
      break;
    case "tool_exec_start":
      callbacks.onToolExecStart(data);
      break;
    case "tool_exec_end":
      callbacks.onToolExecEnd(data);
      break;
    case "done":
      callbacks.onDone();
      break;
    case "error":
      callbacks.onError(data.error, data.severity, data.code);
      break;
    case "llm_status":
      callbacks.onLLMStatus(data);
      break;
  }
}

// ============ Chat Status & Resume API ============

export async function checkChatStatus(sessionId: string): Promise<{ streaming: boolean; messageCount?: number }> {
  return request(`/chat/status/${sessionId}`);
}

/** 中止指定 session 的 Agent 执行 */
export async function abortChat(sessionId: string): Promise<void> {
  await request(`/chat/abort`, {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export interface ResumeStreamCallbacks {
  onCatchup: (data: { text: string; thinking?: string; toolCalls?: Array<{ id: string; name: string; args: any; status: string }> }) => void;
  onTextDelta: (delta: string) => void;
  onThinkingStart: () => void;
  onThinkingDelta: (delta: string) => void;
  onThinkingEnd: () => void;
  onToolExecStart: (data: { toolCallId: string; toolName: string; args: any }) => void;
  onToolExecEnd: (data: { toolCallId: string; toolName: string; result: any; isError: boolean }) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function resumeChat(
  sessionId: string,
  callbacks: ResumeStreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${BASE}/chat/resume/${sessionId}`, { signal });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || "Resume 请求失败");
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const block of parts) {
        if (!block.trim()) continue;
        let eventType = "";
        let dataStr = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6);
          }
        }
        if (!eventType || eventType === "heartbeat" || !dataStr) continue;
        try {
          const data = JSON.parse(dataStr);
          handleResumeEvent(eventType, data, callbacks);
        } catch {}
      }
    }
  } catch (err: any) {
    if (signal?.aborted) return;
    console.warn("[resumeChat] SSE 流读取中断:", err.message);
    callbacks.onError(`连接中断: ${err.message || "网络异常"}`);
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

function handleResumeEvent(type: string, data: any, callbacks: ResumeStreamCallbacks) {
  switch (type) {
    case "catchup":
      callbacks.onCatchup(data);
      break;
    case "text_delta":
      callbacks.onTextDelta(data.delta);
      break;
    case "thinking_start":
      callbacks.onThinkingStart();
      break;
    case "thinking_delta":
      callbacks.onThinkingDelta(data.delta);
      break;
    case "thinking_end":
      callbacks.onThinkingEnd();
      break;
    case "tool_exec_start":
      callbacks.onToolExecStart(data);
      break;
    case "tool_exec_end":
      callbacks.onToolExecEnd(data);
      break;
    case "done":
      callbacks.onDone();
      break;
    case "error":
      callbacks.onError(data.error);
      break;
  }
}

// ============ Logs API ============

export interface LogFilter {
  level?: string;
  module?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export async function fetchLogs(filter: LogFilter = {}): Promise<{ entries: LogEntry[]; total: number }> {
  const params = new URLSearchParams();
  if (filter.level) params.set("level", filter.level);
  if (filter.module) params.set("module", filter.module);
  if (filter.since) params.set("since", filter.since);
  if (filter.limit) params.set("limit", String(filter.limit));
  if (filter.offset) params.set("offset", String(filter.offset));
  const qs = params.toString();
  return request(`/logs${qs ? `?${qs}` : ""}`);
}

export interface LLMRequestFilter {
  sessionId?: string;
  status?: string;
  modelId?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export async function fetchLLMRequests(filter: LLMRequestFilter = {}): Promise<{ requests: LLMRequestRecord[]; total: number }> {
  const params = new URLSearchParams();
  if (filter.sessionId) params.set("sessionId", filter.sessionId);
  if (filter.status) params.set("status", filter.status);
  if (filter.modelId) params.set("modelId", filter.modelId);
  if (filter.since) params.set("since", filter.since);
  params.set("limit", String(filter.limit || 50));
  if (filter.offset) params.set("offset", String(filter.offset));
  return request(`/logs/llm-requests?${params.toString()}`);
}

export async function fetchLLMRequestModels(): Promise<{ models: string[] }> {
  return request("/logs/llm-requests/models");
}

export async function fetchCumulativeTokens(sessionId: string): Promise<CumulativeTokens> {
  return request(`/logs/cumulative-tokens?sessionId=${encodeURIComponent(sessionId)}`);
}

// ============ Tasks API ============

export async function fetchTasks(): Promise<Task[]> {
  const data = await request<{ tasks: Task[] }>('/tasks');
  return data.tasks;
}

export async function createTask(input: {
  name: string;
  prompt: string;
  cron: string;
  type: string;
  enabled?: boolean;
  timeout?: number;
  modelId?: string;
}): Promise<Task> {
  const data = await request<{ task: Task }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.task;
}

export async function updateTask(id: string, input: Partial<typeof createTask extends (...args: infer P) => any ? P[0] : never>): Promise<Task> {
  const data = await request<{ task: Task }>(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.task;
}

export async function deleteTask(id: string): Promise<void> {
  await request(`/tasks/${id}`, { method: 'DELETE' });
}

export async function toggleTask(id: string, enabled: boolean): Promise<Task> {
  const data = await request<{ task: Task }>(`/tasks/${id}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
  return data.task;
}

export async function triggerTask(id: string): Promise<TaskRun> {
  const data = await request<{ run: TaskRun }>(`/tasks/${id}/trigger`, {
    method: 'POST',
  });
  return data.run;
}

export interface TaskRunFilter {
  taskId?: string;
  status?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export async function fetchTaskRuns(filter: TaskRunFilter = {}): Promise<{ runs: TaskRun[]; total: number }> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.since) params.set("since", filter.since);
  params.set("limit", String(filter.limit || 50));
  if (filter.offset) params.set("offset", String(filter.offset));
  const url = filter.taskId
    ? `/tasks/${filter.taskId}/runs?${params.toString()}`
    : `/tasks/runs?${params.toString()}`;
  return request(url);
}

export async function fetchTaskRunStats(): Promise<{
  total: number;
  success: number;
  failed: number;
  timeout: number;
  running: number;
  avgDuration: number;
  taskStats: { taskId: string; taskName: string; total: number; success: number; failed: number; avgDuration: number }[];
}> {
  return request("/tasks/runs/stats");
}

/** 获取单条任务执行详情（含完整 output/error + 任务 prompt） */
export async function fetchTaskRunDetail(runId: string): Promise<{
  run: TaskRun;
  task: { prompt: string; cron: string; type: string } | null;
}> {
  return request(`/tasks/runs/${runId}`);
}

// ============ Stats API ============

export interface StatsOverview {
  totalSessions: number;
  totalMessages: number;
  totalLLMRequests: number;
  totalTokens: number;
}

export interface DailyStats {
  days: {
    date: string;
    sessions: number;
    messages: number;
    llmRequests: number;
  }[];
}

export interface ModelStats {
  models: {
    modelId: string;
    count: number;
  }[];
}

export interface PerformanceStats {
  days: {
    date: string;
    avgTTFT: number;
    avgDuration: number;
    p50TTFT: number;
    p95TTFT: number;
    requestCount: number;
  }[];
}

export interface ErrorStats {
  days: {
    date: string;
    llmErrors: number;
    taskFailures: number;
  }[];
  totalLLMErrors: number;
  totalTaskFailures: number;
}

export async function fetchStatsOverview(): Promise<StatsOverview> {
  return request("/stats/overview");
}

export async function fetchStatsDaily(days = 7): Promise<DailyStats> {
  return request(`/stats/daily?days=${days}`);
}

export async function fetchStatsModels(): Promise<ModelStats> {
  return request("/stats/models");
}

export async function fetchStatsPerformance(days = 7): Promise<PerformanceStats> {
  return request(`/stats/performance?days=${days}`);
}

export async function fetchStatsErrors(days = 7): Promise<ErrorStats> {
  return request(`/stats/errors?days=${days}`);
}

// ============ System Prompt API ============

export async function fetchSystemPrompt(): Promise<{ content: string }> {
  return request("/config/system-prompt");
}

export async function saveSystemPrompt(content: string): Promise<{ ok: boolean; message: string }> {
  return request("/config/system-prompt", {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

// ============ Templates API ============

export async function fetchTemplates(enabledOnly = false): Promise<PromptTemplate[]> {
  const qs = enabledOnly ? "?enabled=true" : "";
  return request(`/templates${qs}`);
}

export async function fetchTemplate(id: string): Promise<PromptTemplate> {
  return request(`/templates/${id}`);
}

export async function createTemplate(input: {
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  content?: string;
}): Promise<PromptTemplate> {
  return request("/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTemplate(id: string, input: {
  name?: string;
  description?: string;
  icon?: string;
  category?: string;
  content?: string;
  sortOrder?: number;
}): Promise<PromptTemplate> {
  return request(`/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await request(`/templates/${id}`, { method: "DELETE" });
}

export async function toggleTemplateEnabled(id: string, enabled: boolean): Promise<void> {
  await request(`/templates/${id}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}
