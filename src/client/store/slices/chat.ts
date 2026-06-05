/**
 * 对话状态 slice
 * 管理消息列表、SSE 流式对话、LLM 状态
 */
import type { ChatMessage, ToolCallInfo, LLMRequestStatus, LLMStatusData, CumulativeTokens } from "../../types";
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
}

export interface ChatActions {
  sendMessage: (content: string, images?: Array<{ data: string; mimeType: string }>) => Promise<void>;
  regenerateMessage: () => Promise<void>;
  abortChat: () => void;
  getCurrentLLMStatus: () => LLMStatusData | null;
  setLLMStatus: (sessionId: string, data: LLMStatusData | null) => void;
  refreshCumulativeTokens: (sessionId: string) => Promise<void>;
  // 内部方法
  _resumeStream: (sessionId: string) => Promise<void>;
  _setStreaming: (v: boolean) => void;
  _appendText: (delta: string) => void;
  _setThinking: (text: string) => void;
  _appendThinking: (delta: string) => void;
  _addToolCall: (tc: ToolCallInfo) => void;
  _updateToolCall: (id: string, updates: Partial<ToolCallInfo>) => void;
  _commitAssistantMessage: () => void;
}

export type ChatSlice = ChatState & ChatActions;

let abortController: AbortController | null = null;

export const createChatSlice = (set: any, get: any): ChatSlice => ({
  messages: [],
  isStreaming: false,
  streamingMessageId: null,
  currentText: "",
  currentThinking: "",
  currentToolCalls: [],
  llmStatusBySession: {},
  cumulativeTokensBySession: {},

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

  sendMessage: async (content: string, images?: Array<{ data: string; mimeType: string }>) => {
    const { currentSessionId } = get();
    if (!currentSessionId || (!content.trim() && (!images || images.length === 0))) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      const title = content.trim() ? content.slice(0, 30) : "图片对话";
      const session = await get().createSession(title);
      sessionId = session.id;
    }

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
        onDone: () => {
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null });
        },
        onError: (error) => {
          if (!get().currentText) {
            set({ currentText: `⚠️ 请求失败：${error || "未知错误"}` });
          }
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null });
        },
      }, abortController.signal, modelId || undefined, thinkingLevel, images);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        if (!get().currentText) {
          set({ currentText: `⚠️ 请求失败：${err.message || "未知错误"}` });
        }
        get()._commitAssistantMessage();
        set({ isStreaming: false, streamingMessageId: null });
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

  abortChat: () => {
    const sessionId = get().currentSessionId;
    // 1. 中止前端 SSE 连接
    abortController?.abort();
    abortController = null;
    set({ isStreaming: false, streamingMessageId: null });
    // 2. 调后端接口停止 Agent 执行
    if (sessionId) {
      api.abortChat(sessionId).catch(() => {});
    }
  },

  _resumeStream: async (sessionId: string) => {
    const assistantId = `resume-${Date.now()}`;

    set((state: ChatState) => ({
      isStreaming: true,
      streamingMessageId: assistantId,
      currentText: "",
      currentThinking: "",
      currentToolCalls: [],
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
          set({ isStreaming: false, streamingMessageId: null });
        },
        onError: (error) => {
          if (!get().currentText) {
            set({ currentText: `⚠️ 请求失败：${error || "未知错误"}` });
          }
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null });
        },
      }, abortController.signal);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        if (!get().currentText) {
          set({ currentText: `⚠️ 请求失败：${err.message || "未知错误"}` });
        }
        get()._commitAssistantMessage();
        set({ isStreaming: false, streamingMessageId: null });
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
