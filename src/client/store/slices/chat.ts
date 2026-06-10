/**
 * 对话状态 slice
 * 管理消息列表、SSE 流式对话、LLM 状态、消息搜索
 */
import type { ChatMessage, ToolCallInfo, LLMRequestStatus, LLMStatusData, CumulativeTokens, DebugEntry } from "../../types";
import * as api from "../../lib/client";
import { convertToChatMessages } from "./chat-helpers";

export interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  currentText: string;
  currentThinking: string;
  currentToolCalls: ToolCallInfo[];
  llmStatusBySession: Record<string, LLMStatusData>;
  cumulativeTokensBySession: Record<string, CumulativeTokens>;
  // 消息搜索
  messageSearch: string;
  messageSearchOpen: boolean;
  // Debug 模式
  debugEnabled: boolean;
  debugEntries: DebugEntry[];
  debugPanelOpen: boolean;
  // SSE 重连状态（0 = 未重连，>0 = 当前重连次数）
  reconnecting: number;
  reconnectMaxRetries: number;
}

export interface ChatActions {
  sendMessage: (content: string, images?: Array<{ data: string; mimeType: string }>) => Promise<void>;
  regenerateMessage: () => Promise<void>;
  editAndResend: (messageId: string, newContent: string) => Promise<void>;
  abortChat: () => void;
  getCurrentLLMStatus: () => LLMStatusData | null;
  setLLMStatus: (sessionId: string, data: LLMStatusData | null) => void;
  refreshCumulativeTokens: (sessionId: string) => Promise<void>;
  setMessageSearch: (q: string) => void;
  setMessageSearchOpen: (open: boolean) => void;
  // Debug
  toggleDebug: () => void;
  toggleDebugPanel: () => void;
  addDebugEntry: (entry: Omit<DebugEntry, "id" | "timestamp">) => void;
  clearDebugEntries: () => void;
  clearDebugOnSessionChange: () => void;
  // 内部方法
  _resumeStream: (sessionId: string) => Promise<void>;
  _setStreaming: (v: boolean) => void;
  _appendText: (delta: string) => void;
  _setThinking: (text: string) => void;
  _appendThinking: (delta: string) => void;
  _addToolCall: (tc: ToolCallInfo) => void;
  _updateToolCall: (id: string, updates: Partial<ToolCallInfo>) => void;
  _commitAssistantMessage: () => void;
  _setReconnecting: (attempt: number, maxRetries: number) => void;
}

export type ChatSlice = ChatState & ChatActions;

let abortController: AbortController | null = null;

/** Debug 条目最大数量，超出时丢弃最早的条目 */
const MAX_DEBUG_ENTRIES = 200;

export const createChatSlice = (set: any, get: any): ChatSlice => ({
  messages: [],
  isStreaming: false,
  streamingMessageId: null,
  currentText: "",
  currentThinking: "",
  currentToolCalls: [],
  llmStatusBySession: {},
  cumulativeTokensBySession: {},
  messageSearch: "",
  messageSearchOpen: false,
  // Debug
  debugEnabled: false,
  debugEntries: [],
  debugPanelOpen: false,
  // 重连
  reconnecting: 0,
  reconnectMaxRetries: 0,

  getCurrentLLMStatus: () => {
    const { currentSessionId, llmStatusBySession } = get();
    if (!currentSessionId) return null;
    return llmStatusBySession[currentSessionId] || null;
  },

  setLLMStatus: (sessionId, data) => {
    set((state: ChatState) => {
      const next = { ...state.llmStatusBySession };
      if (!data) {
        delete next[sessionId];
      } else {
        next[sessionId] = data;
      }
      return { llmStatusBySession: next };
    });
  },

  refreshCumulativeTokens: async (sessionId: string) => {
    try {
      const tokens = await api.fetchCumulativeTokens(sessionId);
      set((state: ChatState) => ({
        cumulativeTokensBySession: { ...state.cumulativeTokensBySession, [sessionId]: tokens },
      }));
    } catch {
      // 静默失败，不影响用户体验
    }
  },

  setMessageSearch: (q) => set({ messageSearch: q }),
  setMessageSearchOpen: (open) => set({ messageSearchOpen: open, messageSearch: open ? get().messageSearch : "" }),

  // Debug actions
  toggleDebug: () => set((state: ChatState) => ({ debugEnabled: !state.debugEnabled })),
  toggleDebugPanel: () => set((state: ChatState) => ({ debugPanelOpen: !state.debugPanelOpen })),
  /** 切换 session 时清空 debug 条目，避免跨 session 混淆 */
  clearDebugOnSessionChange: () => set({ debugEntries: [] }),
  addDebugEntry: (entry) => set((state: ChatState) => {
    const newEntry = { ...entry, id: `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() };
    const entries = [...state.debugEntries, newEntry];
    // 超出上限时丢弃最早的条目，防止长时间运行内存膨胀
    if (entries.length > MAX_DEBUG_ENTRIES) {
      entries.splice(0, entries.length - MAX_DEBUG_ENTRIES);
    }
    return { debugEntries: entries };
  }),
  clearDebugEntries: () => set({ debugEntries: [] }),

  sendMessage: async (content: string, images?: Array<{ data: string; mimeType: string }>) => {
    const { currentSessionId } = get();
    if (!currentSessionId || (!content.trim() && (!images || images.length === 0))) return;

    let sessionId = currentSessionId;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      content: content.trim(),
      images: images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType })),
      timestamp: Date.now(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      type: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    set((state: ChatState) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isStreaming: true,
      streamingMessageId: assistantId,
      currentText: "",
      currentThinking: "",
      currentToolCalls: [],
      reconnecting: 0,
      llmStatusBySession: {
        ...state.llmStatusBySession,
        [sessionId]: { status: "connecting" } as LLMStatusData,
      },
    }));

    abortController = new AbortController();

    try {
      const modelId = get().currentModelId;
      const thinkingLevel = get().thinkingLevel;
      await api.streamChat(sessionId, content, {
        onTextDelta: (delta) => get()._appendText(delta),
        onThinkingStart: () => get()._setThinking(""),
        onThinkingDelta: (delta) => get()._appendThinking(delta),
        onThinkingEnd: () => {},
        onToolStart: () => {},
        onToolEnd: () => {},
        onToolExecStart: (data) => {
          get()._addToolCall({ id: data.toolCallId, name: data.toolName, args: data.args, status: "running" });
        },
        onToolExecEnd: (data) => {
          get()._updateToolCall(data.toolCallId, { result: data.result, status: data.isError ? "error" : "done", isError: data.isError });
        },
        onLLMStatus: (data) => {
          get().setLLMStatus(sessionId, {
            status: data.status as LLMRequestStatus,
            requestId: data.requestId,
            ttft: data.ttft,
            duration: data.duration,
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens,
            error: data.error,
          } as LLMStatusData);
          // LLM 请求完成后刷新累计 token 用量
          if (data.status === "completed") {
            get().refreshCumulativeTokens(sessionId);
          }
        },
        onDebugEvent: get().debugEnabled
          ? (type, data) => get().addDebugEntry({ type: type.replace("debug_", "") as any, data })
          : undefined,
        // 重连 catchup：恢复已累积的内容到 UI
        onCatchup: (data) => {
          const catchupToolCalls: ToolCallInfo[] | undefined = data.toolCalls?.map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            args: tc.args,
            status: (tc.status as ToolCallInfo["status"]) || "done",
          }));
          set((state: ChatState) => {
            const messages = [...state.messages];
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.type === "assistant") {
              messages[messages.length - 1] = {
                ...lastMsg,
                content: data.text,
                thinking: data.thinking || undefined,
                toolCalls: catchupToolCalls,
              };
            }
            return {
              messages,
              currentText: data.text,
              currentThinking: data.thinking || "",
              currentToolCalls: catchupToolCalls || [],
            };
          });
        },
        onDone: () => {
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null, reconnecting: 0 });
        },
        onError: (error, severity) => {
          // 错误改为 Toast 通知，不嵌入对话流
          if (severity === "recoverable") {
            get().addToast?.("warning", error, 5000);
          } else {
            get().addToast?.("error", error, 6000);
          }
          // 空消息时仍显示简要提示，但不作为 AI 回复
          if (!get().currentText) {
            set({ currentText: "" });
          }
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null, reconnecting: 0 });
        },
        onReconnecting: (attempt, maxRetries) => {
          set({ reconnecting: attempt, reconnectMaxRetries: maxRetries });
          // 首次重连时弹 Toast
          if (attempt === 1) {
            get().addToast?.("warning", "连接中断，正在尝试重连...", 8000);
          }
        },
        onReconnected: () => {
          set({ reconnecting: 0 });
          get().addToast?.("success", "已重新连接", 3000);
        },
      }, abortController.signal, modelId || undefined, thinkingLevel, images);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        get().addToast?.("error", `请求失败：${err.message || "未知错误"}`, 6000);
        get()._commitAssistantMessage();
        set({ isStreaming: false, streamingMessageId: null, reconnecting: 0 });
      }
    }
  },

  regenerateMessage: async () => {
    const { messages, isStreaming } = get();
    if (isStreaming) return;

    const lastUserIdx = [...messages].reverse().findIndex((m: ChatMessage) => m.type === "user");
    if (lastUserIdx === -1) return;
    const lastUserMsg = messages[messages.length - 1 - lastUserIdx];

    const trimmed = [...messages];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].type === "assistant") {
      trimmed.pop();
    }
    set({ messages: trimmed });
    await get().sendMessage(lastUserMsg.content, lastUserMsg.images);
  },

  /** 编辑用户消息并重新发送 */
  editAndResend: async (messageId: string, newContent: string) => {
    const { messages, isStreaming, currentSessionId } = get();
    if (isStreaming) {
      get().addToast?.("warning", "当前正在对话中，请稍后再试", 3000);
      return;
    }
    if (!currentSessionId) {
      get().addToast?.("error", "未选择会话", 3000);
      return;
    }
    if (!newContent.trim()) {
      get().addToast?.("warning", "消息内容不能为空", 3000);
      return;
    }

    // 找到该用户消息的位置
    const idx = messages.findIndex((m: ChatMessage) => m.id === messageId);
    if (idx === -1) {
      get().addToast?.("error", "未找到原消息", 3000);
      return;
    }

    // 截断：保留该消息之前的内容 + 更新该消息内容
    const trimmed = messages.slice(0, idx);
    const oldMsg = messages[idx];
    trimmed.push({ ...oldMsg, content: newContent });

    set({ messages: trimmed });
    await get().sendMessage(newContent, oldMsg.images);
  },

  abortChat: () => {
    const sessionId = get().currentSessionId;
    // 1. 中止前端 SSE 连接
    abortController?.abort();
    abortController = null;
    set({ isStreaming: false, streamingMessageId: null, reconnecting: 0 });
    // 2. 调后端接口停止 Agent 执行
    if (sessionId) {
      api.abortChat(sessionId).catch(() => {});
    }
  },

  _setReconnecting: (attempt, maxRetries) => set({ reconnecting: attempt, reconnectMaxRetries: maxRetries }),

  _resumeStream: async (sessionId: string) => {
    const assistantId = `resume-${Date.now()}`;

    set((state: ChatState) => ({
      isStreaming: true,
      streamingMessageId: assistantId,
      currentText: "",
      currentThinking: "",
      currentToolCalls: [],
      reconnecting: 0,
      llmStatusBySession: {
        ...state.llmStatusBySession,
        [sessionId]: { status: "streaming" } as LLMStatusData,
      },
    }));

    set((state: ChatState) => ({
      messages: [...state.messages, {
        id: assistantId,
        type: "assistant" as const,
        content: "",
        timestamp: Date.now(),
      }],
    }));

    abortController = new AbortController();

    try {
      await api.resumeChat(sessionId, {
        onCatchup: (data) => {
          const catchupToolCalls: ToolCallInfo[] | undefined = data.toolCalls?.map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            args: tc.args,
            status: (tc.status as ToolCallInfo["status"]) || "done",
          }));
          set((state: ChatState) => {
            const messages = [...state.messages];
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.type === "assistant") {
              messages[messages.length - 1] = {
                ...lastMsg,
                content: data.text,
                thinking: data.thinking || undefined,
                toolCalls: catchupToolCalls,
              };
            }
            return {
              messages,
              currentText: data.text,
              currentThinking: data.thinking || "",
              currentToolCalls: catchupToolCalls || [],
            };
          });
        },
        onTextDelta: (delta) => get()._appendText(delta),
        onThinkingStart: () => get()._setThinking(""),
        onThinkingDelta: (delta) => get()._appendThinking(delta),
        onThinkingEnd: () => {},
        onToolExecStart: (data) => {
          get()._addToolCall({ id: data.toolCallId, name: data.toolName, args: data.args, status: "running" });
        },
        onToolExecEnd: (data) => {
          get()._updateToolCall(data.toolCallId, { result: data.result, status: data.isError ? "error" : "done", isError: data.isError });
        },
        onDone: () => {
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null, reconnecting: 0 });
        },
        onError: (error) => {
          get().addToast?.("error", `请求失败：${error || "未知错误"}`, 6000);
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null, reconnecting: 0 });
        },
      }, abortController.signal);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        get().addToast?.("error", `请求失败：${err.message || "未知错误"}`, 6000);
        get()._commitAssistantMessage();
        set({ isStreaming: false, streamingMessageId: null, reconnecting: 0 });
      }
    }
  },

  // ============ 内部方法 ============

  _setStreaming: (v) => set({ isStreaming: v }),

  _appendText: (delta) =>
    set((state: ChatState) => {
      const newText = state.currentText + delta;
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.type === "assistant") {
        messages[messages.length - 1] = { ...lastMsg, content: newText };
      }
      return { currentText: newText, messages };
    }),

  _setThinking: (text) => set({ currentThinking: text }),

  _appendThinking: (delta) =>
    set((state: ChatState) => {
      const newThinking = state.currentThinking + delta;
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.type === "assistant") {
        messages[messages.length - 1] = { ...lastMsg, thinking: newThinking || undefined };
      }
      return { currentThinking: newThinking, messages };
    }),

  _addToolCall: (tc) =>
    set((state: ChatState) => {
      const newToolCalls = [...state.currentToolCalls, tc];
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.type === "assistant") {
        messages[messages.length - 1] = { ...lastMsg, toolCalls: [...newToolCalls] };
      }
      return { currentToolCalls: newToolCalls, messages };
    }),

  _updateToolCall: (id, updates) =>
    set((state: ChatState) => {
      const newToolCalls = state.currentToolCalls.map((tc) =>
        tc.id === id ? { ...tc, ...updates } : tc
      );
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.type === "assistant") {
        messages[messages.length - 1] = { ...lastMsg, toolCalls: [...newToolCalls] };
      }
      return { currentToolCalls: newToolCalls, messages };
    }),

  _commitAssistantMessage: () =>
    set((state: ChatState) => {
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.type === "assistant") {
        messages[messages.length - 1] = {
          ...lastMsg,
          content: state.currentText,
          thinking: state.currentThinking || undefined,
          toolCalls: state.currentToolCalls.length > 0 ? state.currentToolCalls : undefined,
        };
      }
      return { messages, currentText: "", currentThinking: "", currentToolCalls: [] };
    }),
});
