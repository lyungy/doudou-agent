/**
 * Zustand 全局状态管理
 */
import { create } from "zustand";
import type { SessionMeta, ChatMessage, ToolCallInfo, ModelDef, LLMRequestStatus, LLMStatusData, ThinkingLevel, MainView, LogSubView, Task, TaskRun, PromptTemplate } from "../types";
import * as api from "../lib/client";
import { getSessionIdFromUrl, updateUrlWithSession, pushSessionHistory, isValidSessionId } from "../lib/url";

interface AppState {
  // 模型状态
  models: ModelDef[];
  currentModelId: string;
  loadingModels: boolean;

  // Session 状态
  sessions: SessionMeta[];
  currentSessionId: string | null;
  loadingSessions: boolean;

  // 视图状态
  currentView: MainView;
  setCurrentView: (view: MainView) => void;

  // 会话搜索/筛选
  sessionSearch: string;
  setSessionSearch: (q: string) => void;
  searchContent: boolean;
  setSearchContent: (v: boolean) => void;
  sessionFilter: "all" | "today" | "week" | "month";
  setSessionFilter: (f: "all" | "today" | "week" | "month") => void;

  // 系统提示词
  systemPrompt: string;
  loadingSystemPrompt: boolean;
  loadSystemPrompt: () => Promise<void>;
  saveSystemPrompt: (content: string) => Promise<void>;

  // 提示词模板
  templates: PromptTemplate[];
  loadingTemplates: boolean;
  pendingTemplateContent: string | null;  // 待填入输入框的模板内容
  loadTemplates: () => Promise<void>;
  fillTemplate: (template: PromptTemplate) => Promise<void>;
  clearPendingTemplate: () => void;

  // 日志子视图
  logSubView: LogSubView;
  setLogSubView: (view: LogSubView) => void;

  // 任务状态
  tasks: Task[];
  loadingTasks: boolean;
  loadTasks: () => Promise<void>;
  createTask: (input: any) => Promise<Task>;
  updateTask: (id: string, input: any) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string, enabled: boolean) => Promise<void>;
  triggerTask: (id: string) => Promise<TaskRun>;

  // 任务执行日志
  taskRuns: TaskRun[];
  loadingTaskRuns: boolean;
  loadTaskRuns: (taskId?: string) => Promise<void>;

  // 思考等级
  thinkingLevel: ThinkingLevel;
  setThinkingLevel: (level: ThinkingLevel) => void;

  // 对话状态
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;

  // 当前正在构建的消息
  currentText: string;
  currentThinking: string;
  currentToolCalls: ToolCallInfo[];

  // LLM 状态（per-session）
  llmStatusBySession: Record<string, LLMStatusData>;
  /** 获取当前 session 的 LLM 状态 */
  getCurrentLLMStatus: () => LLMStatusData | null;
  setLLMStatus: (sessionId: string, data: LLMStatusData | null) => void;

  // 操作
  loadModels: () => Promise<void>;
  setModel: (modelId: string) => void;
  loadSessions: () => Promise<void>;
  createSession: (title?: string) => Promise<SessionMeta>;
  selectSession: (id: string, pushHistory?: boolean) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  deleteSessions: (ids: string[]) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  togglePin: (id: string, pinned: boolean) => Promise<void>;
  sendMessage: (content: string, images?: Array<{ data: string; mimeType: string }>) => Promise<void>;
  regenerateMessage: () => Promise<void>;
  abortChat: () => void;

  // 初始化（页面加载时调用，从 URL 恢复会话状态）
  initApp: () => Promise<void>;

  // 内部方法
  _setStreaming: (v: boolean) => void;
  _appendText: (delta: string) => void;
  _setThinking: (text: string) => void;
  _appendThinking: (delta: string) => void;
  _addToolCall: (tc: ToolCallInfo) => void;
  _updateToolCall: (id: string, updates: Partial<ToolCallInfo>) => void;
  _commitAssistantMessage: () => void;

  // SSE 重连（刷新后自动恢复）
  _resumeStream: (sessionId: string) => Promise<void>;
}

let abortController: AbortController | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  // 初始状态
  models: [],
  currentModelId: "",
  loadingModels: false,
  sessions: [],
  currentSessionId: null,
  loadingSessions: false,

  // 对话状态
  messages: [],
  isStreaming: false,
  streamingMessageId: null,

  // 视图状态
  currentView: "home" as MainView,
  setCurrentView: (view) => set({ currentView: view }),

  // 会话搜索/筛选
  sessionSearch: "",
  setSessionSearch: (q) => set({ sessionSearch: q }),
  searchContent: false,
  setSearchContent: (v) => set({ searchContent: v }),
  sessionFilter: "all" as "all" | "today" | "week" | "month",
  setSessionFilter: (f) => set({ sessionFilter: f }),

  // 系统提示词
  systemPrompt: "",
  loadingSystemPrompt: false,
  loadSystemPrompt: async () => {
    set({ loadingSystemPrompt: true });
    try {
      const data = await api.fetchSystemPrompt();
      set({ systemPrompt: data.content, loadingSystemPrompt: false });
    } catch {
      set({ loadingSystemPrompt: false });
    }
  },
  saveSystemPrompt: async (content: string) => {
    await api.saveSystemPrompt(content);
    set({ systemPrompt: content });
  },

  // 提示词模板
  templates: [],
  loadingTemplates: false,
  pendingTemplateContent: null,
  loadTemplates: async () => {
    set({ loadingTemplates: true });
    try {
      const templates = await api.fetchTemplates(true);
      set({ templates, loadingTemplates: false });
    } catch {
      set({ loadingTemplates: false });
    }
  },
  fillTemplate: async (template: PromptTemplate) => {
    // 读取模板内容后填入输入框（不直接发送）
    try {
      const full = await api.fetchTemplate(template.id);
      if (full.content) {
        set({ pendingTemplateContent: full.content });
      }
    } catch (err: any) {
      console.error("加载模板失败:", err.message);
    }
  },
  clearPendingTemplate: () => set({ pendingTemplateContent: null }),

  // 日志子视图
  logSubView: "system" as LogSubView,
  setLogSubView: (view) => set({ logSubView: view }),

  // 任务状态
  tasks: [],
  loadingTasks: false,
  loadTasks: async () => {
    set({ loadingTasks: true });
    try {
      const tasks = await api.fetchTasks();
      set({ tasks, loadingTasks: false });
    } catch {
      set({ loadingTasks: false });
    }
  },
  createTask: async (input) => {
    const task = await api.createTask(input);
    set((s) => ({ tasks: [...s.tasks, task] }));
    return task;
  },
  updateTask: async (id, input) => {
    const task = await api.updateTask(id, input);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
    return task;
  },
  deleteTask: async (id) => {
    await api.deleteTask(id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },
  toggleTask: async (id, enabled) => {
    const task = await api.toggleTask(id, enabled);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
  },
  triggerTask: async (id) => {
    const run = await api.triggerTask(id);
    // 刷新任务列表以更新 lastRunAt/runCount
    const tasks = await api.fetchTasks();
    set({ tasks });
    return run;
  },

  // 任务执行日志
  taskRuns: [],
  loadingTaskRuns: false,
  loadTaskRuns: async (taskId) => {
    set({ loadingTaskRuns: true });
    try {
      const runs = await api.fetchTaskRuns(taskId);
      set({ taskRuns: runs, loadingTaskRuns: false });
    } catch {
      set({ loadingTaskRuns: false });
    }
  },

  // 思考等级
  thinkingLevel: "medium" as ThinkingLevel,
  setThinkingLevel: (level) => set({ thinkingLevel: level }),

  // 当前正在构建的消息
  currentText: "",
  currentThinking: "",
  currentToolCalls: [],

  // LLM 状态（per-session）
  llmStatusBySession: {},

  getCurrentLLMStatus: () => {
    const { currentSessionId, llmStatusBySession } = get();
    if (!currentSessionId) return null;
    return llmStatusBySession[currentSessionId] || null;
  },

  setLLMStatus: (sessionId, data) => {
    set((state) => {
      const next = { ...state.llmStatusBySession };
      if (!data) {
        delete next[sessionId];
      } else {
        next[sessionId] = data;
      }
      return { llmStatusBySession: next };
    });
  },

  // ============ 模型 ============

  loadModels: async () => {
    set({ loadingModels: true });
    try {
      const { models, thinkingLevel } = await api.fetchModels();
      // 保留用户已选择的模型，仅在首次加载时默认选第一个
      const prevModelId = get().currentModelId;
      const currentModelId = prevModelId && models.some((m) => m.id === prevModelId)
        ? prevModelId
        : models[0]?.id || "";
      const validLevels = ["off", "minimal", "low", "medium", "high", "xhigh"];
      const tl = validLevels.includes(thinkingLevel) ? thinkingLevel as ThinkingLevel : "off" as ThinkingLevel;
      set({ models, currentModelId, thinkingLevel: tl, loadingModels: false });
    } catch {
      set({ loadingModels: false });
    }
  },

  setModel: (modelId: string) => {
    set({ currentModelId: modelId });
    const { currentSessionId } = get();
    if (currentSessionId) {
      api.updateSessionModel(currentSessionId, modelId).catch(() => {});
    }
  },

  // ============ Session ============

  loadSessions: async () => {
    set({ loadingSessions: true });
    try {
      const { sessionSearch, searchContent } = get();
      const q = sessionSearch.trim() || undefined;
      const sessions = await api.fetchSessions(q, q && searchContent ? true : undefined);
      set({ sessions, loadingSessions: false });
    } catch {
      set({ loadingSessions: false });
    }
  },

  createSession: async (title?: string) => {
    const modelId = get().currentModelId;
    const session = await api.createSession(title, modelId);
    set((state) => ({
      sessions: [session, ...state.sessions],
      currentSessionId: session.id,
      currentView: "chat" as MainView,
      messages: [],
    }));
    // 同步 URL（替换当前历史记录）
    updateUrlWithSession(session.id);
    return session;
  },

  selectSession: async (id: string, pushHistory = true) => {
    const session = get().sessions.find((s) => s.id === id);
    set({
      currentSessionId: id,
      currentView: "chat" as MainView,
      messages: [],
      currentModelId: session?.modelId || get().currentModelId,
    });

    // 同步 URL
    if (pushHistory) {
      pushSessionHistory(id);
    } else {
      updateUrlWithSession(id);
    }

    // 加载已持久化的历史消息
    try {
      const rawMessages = await api.fetchSessionMessages(id);
      const messages = convertToChatMessages(rawMessages);
      set({ messages });
    } catch (err: any) {
      console.error("加载消息失败:", err.message);
    }

    // 检测 Agent 是否仍在流式中，自动重连 SSE
    try {
      const status = await api.checkChatStatus(id);
      if (status.streaming) {
        await get()._resumeStream(id);
      }
    } catch {
      // 状态检测失败，不影响正常使用
    }
  },

  deleteSession: async (id: string) => {
    // 先更新 UI（乐观删除）
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      const currentSessionId =
        state.currentSessionId === id ? (sessions[0]?.id || null) : state.currentSessionId;
      return { sessions, currentSessionId };
    });

    // 同步 URL
    const { currentSessionId } = get();
    updateUrlWithSession(currentSessionId);

    // 再调后端
    try {
      await api.deleteSession(id);
    } catch (err: any) {
      console.error("删除失败:", err.message);
      // 刷新列表恢复正确状态
      get().loadSessions();
    }
  },

  deleteSessions: async (ids: string[]) => {
    // 乐观删除
    set((state) => {
      const remaining = state.sessions.filter((s) => !ids.includes(s.id));
      const currentSessionId = ids.includes(state.currentSessionId || "")
        ? (remaining[0]?.id || null)
        : state.currentSessionId;
      return { sessions: remaining, currentSessionId };
    });

    // 同步 URL
    const { currentSessionId } = get();
    updateUrlWithSession(currentSessionId);

    try {
      await api.deleteSessions(ids);
    } catch (err: any) {
      console.error("批量删除失败:", err.message);
      get().loadSessions();
    }
  },

  renameSession: async (id: string, title: string) => {
    // 乐观更新
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
    }));
    try {
      await api.updateSessionTitle(id, title);
    } catch (err: any) {
      console.error("重命名失败:", err.message);
      get().loadSessions();
    }
  },

  togglePin: async (id: string, pinned: boolean) => {
    // 乐观更新
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, pinned: pinned ? 1 : 0 } : s
      ),
    }));
    try {
      await api.toggleSessionPin(id, pinned);
    } catch (err: any) {
      console.error("置顶失败:", err.message);
      get().loadSessions();
    }
  },

  // ============ 对话 ============

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

    set((state) => ({
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
          const sid = sessionId;
          get().setLLMStatus(sid, {
            status: data.status as LLMRequestStatus,
            requestId: data.requestId,
            ttft: data.ttft,
            duration: data.duration,
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens,
            error: data.error,
          } as LLMStatusData);
        },
        onDone: () => {
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null });
          // LLM 状态保留展示，下次发消息时清空
        },
        onError: () => {
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null });
        },
      }, abortController.signal, modelId || undefined, thinkingLevel, images);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        get()._commitAssistantMessage();
        set({ isStreaming: false, streamingMessageId: null });
      }
    }
  },

  regenerateMessage: async () => {
    const { messages, isStreaming } = get();
    if (isStreaming) return;

    // 找到最后一条 user 消息
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.type === "user");
    if (lastUserIdx === -1) return;
    const lastUserMsg = messages[messages.length - 1 - lastUserIdx];

    // 移除最后一条 assistant 消息（如果有）
    const trimmed = [...messages];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].type === "assistant") {
      trimmed.pop();
    }

    set({ messages: trimmed });

    // 重新发送最后一条 user 消息
    await get().sendMessage(lastUserMsg.content, lastUserMsg.images);
  },

  abortChat: () => {
    abortController?.abort();
    abortController = null;
    set({ isStreaming: false, streamingMessageId: null });
  },

  /** 重连 Agent 正在执行的 SSE 流（刷新后自动恢复） */
  _resumeStream: async (sessionId: string) => {
    const assistantId = `resume-${Date.now()}`;

    // 设置流式状态，UI 显示加载动画
    set((state) => ({
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

    // 在消息列表末尾追加空的 assistant 消息（后续填充）
    set((state) => ({
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
          // 用累积内容替换当前流式消息
          const catchupToolCalls: ToolCallInfo[] | undefined = data.toolCalls?.map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            args: tc.args,
            status: (tc.status as ToolCallInfo["status"]) || "done",
          }));
          set((state) => {
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
        onThinkingStart: () => get()._setThinking("") ,
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
        onError: () => {
          get()._commitAssistantMessage();
          set({ isStreaming: false, streamingMessageId: null });
        },
      }, abortController.signal);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        get()._commitAssistantMessage();
        set({ isStreaming: false, streamingMessageId: null });
      }
    }
  },

  // ============ 初始化 ============

  initApp: async () => {
    // 1. 加载模型列表
    await get().loadModels();
    // 2. 加载会话列表
    await get().loadSessions();
    // 3. 从 URL 恢复会话状态
    const urlSessionId = getSessionIdFromUrl();
    if (urlSessionId) {
      const { sessions } = get();
      if (isValidSessionId(urlSessionId, sessions.map((s) => s.id))) {
        // 有效会话 ID，恢复选中（不推送历史，因为当前就是 URL 来源）
        await get().selectSession(urlSessionId, false);
      } else {
        // 无效会话 ID，清除 URL 参数
        console.warn("URL 中的会话 ID 无效，已清除:", urlSessionId);
        updateUrlWithSession(null);
      }
    }
  },

  // ============ 内部方法 ============

  _setStreaming: (v) => set({ isStreaming: v }),

  _appendText: (delta) =>
    set((state) => {
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
    set((state) => {
      const newThinking = state.currentThinking + delta;
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.type === "assistant") {
        messages[messages.length - 1] = { ...lastMsg, thinking: newThinking || undefined };
      }
      return { currentThinking: newThinking, messages };
    }),

  _addToolCall: (tc) =>
    set((state) => {
      const newToolCalls = [...state.currentToolCalls, tc];
      // 实时同步到当前消息
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.type === "assistant") {
        messages[messages.length - 1] = { ...lastMsg, toolCalls: [...newToolCalls] };
      }
      return { currentToolCalls: newToolCalls, messages };
    }),

  _updateToolCall: (id, updates) =>
    set((state) => {
      const newToolCalls = state.currentToolCalls.map((tc) =>
        tc.id === id ? { ...tc, ...updates } : tc
      );
      // 实时同步到当前消息
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.type === "assistant") {
        messages[messages.length - 1] = { ...lastMsg, toolCalls: [...newToolCalls] };
      }
      return { currentToolCalls: newToolCalls, messages };
    }),

  _commitAssistantMessage: () =>
    set((state) => {
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
}));

/**
 * 将 pi-agent-core 的消息格式转换为前端 ChatMessage
 */
function convertToChatMessages(rawMessages: any[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const msg of rawMessages) {
    if (msg.role === "user") {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : msg.content?.map((c: any) => c.text || "").join("") || "";
      if (!content.trim()) continue;
      messages.push({
        id: `user-${messages.length}`,
        type: "user",
        content,
        timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      });
    } else if (msg.role === "assistant") {
      const textParts =
        msg.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("") || "";
      const thinkingParts =
        msg.content
          ?.filter((c: any) => c.type === "thinking")
          .map((c: any) => c.thinking || c.text || "")
          .join("") || "";
      const toolCalls = msg.content
        ?.filter((c: any) => c.type === "toolCall")
        .map((c: any) => ({
          id: c.toolCallId || "",
          name: c.toolName || "",
          args: c.arguments || {},
          status: "done" as const,
        }));

      // 跳过空的 assistant 消息（error/aborted）
      if (!textParts && !thinkingParts && (!toolCalls || toolCalls.length === 0)) continue;

      messages.push({
        id: `assistant-${messages.length}`,
        type: "assistant",
        content: textParts,
        thinking: thinkingParts || undefined,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      });
    }
  }

  return messages;
}
