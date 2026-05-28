/**
 * API 请求封装
 */
import type { SessionMeta, AppConfig, ChatMessage, ModelDef } from "../types";

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

export async function fetchSessions(): Promise<SessionMeta[]> {
  return request("/sessions");
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

export async function fetchModels(): Promise<ModelDef[]> {
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
  modelId?: string
): Promise<void> {
  const response = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, modelId }),
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
  }
}
