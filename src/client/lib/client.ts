/**
 * API 请求封装
 */
import type { SessionMeta, AppConfig, ChatMessage, ModelDef, LogEntry, LLMRequestRecord, ThinkingLevel, Task, TaskRun, PromptTemplate } from "../types";

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
  onLLMStatus: (data: { status: string; requestId: string; ttft?: number; duration?: number; inputTokens?: number; outputTokens?: number; error?: string }) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

/**
 * 发送消息并接收 SSE 流
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
    body: JSON.stringify({ sessionId, message, modelId, thinkingLevel, images }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || "请求失败");
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 解析 SSE 事件
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const dataStr = line.slice(6);
        if (!eventType || eventType === "heartbeat") continue;

        try {
          const data = JSON.parse(dataStr);
          handleSSEEvent(eventType, data, callbacks);
        } catch {
          // 忽略解析失败的行
        }
      }
    }
  }
}

function handleSSEEvent(type: string, data: any, callbacks: ChatStreamCallbacks) {
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
      callbacks.onError(data.error);
      break;
    case "llm_status":
      callbacks.onLLMStatus(data);
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

export async function fetchLLMRequests(sessionId?: string, limit = 50): Promise<{ requests: LLMRequestRecord[] }> {
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  params.set("limit", String(limit));
  return request(`/logs/llm-requests?${params.toString()}`);
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

export async function fetchTaskRuns(taskId?: string, limit = 50): Promise<TaskRun[]> {
  const params = new URLSearchParams();
  if (taskId) params.set('taskId', taskId);
  params.set('limit', String(limit));
  const url = taskId ? `/tasks/${taskId}/runs?limit=${limit}` : `/tasks/runs?limit=${limit}`;
  const data = await request<{ runs: TaskRun[] }>(url);
  return data.runs;
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
