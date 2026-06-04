/**
 * Session 状态 slice
 * 管理会话列表、搜索筛选、CRUD 操作
 */
import type { SessionMeta, MainView } from "../../types";
import * as api from "../../lib/client";
import { getSessionIdFromUrl, updateUrlWithSession, pushSessionHistory, isValidSessionId } from "../../lib/url";

export interface SessionState {
  sessions: SessionMeta[];
  currentSessionId: string | null;
  loadingSessions: boolean;
  loadingSession: boolean;
  sessionSearch: string;
  searchContent: boolean;
  sessionFilter: "all" | "today" | "week" | "month";
}

export interface SessionActions {
  setSessionSearch: (q: string) => void;
  setSearchContent: (v: boolean) => void;
  setSessionFilter: (f: "all" | "today" | "week" | "month") => void;
  loadSessions: () => Promise<void>;
  createSession: (title?: string) => Promise<SessionMeta>;
  selectSession: (id: string, pushHistory?: boolean) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  deleteSessions: (ids: string[]) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  togglePin: (id: string, pinned: boolean) => Promise<void>;
}

export type SessionSlice = SessionState & SessionActions;

export const createSessionSlice = (set: any, get: any): SessionSlice => ({
  sessions: [],
  currentSessionId: null,
  loadingSessions: false,
  loadingSession: false,
  sessionSearch: "",
  searchContent: false,
  sessionFilter: "all" as "all" | "today" | "week" | "month",

  setSessionSearch: (q) => set({ sessionSearch: q }),
  setSearchContent: (v) => set({ searchContent: v }),
  setSessionFilter: (f) => set({ sessionFilter: f }),

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
    set((state: SessionState) => ({
      sessions: [session, ...state.sessions],
      currentSessionId: session.id,
      currentView: "chat" as MainView,
      messages: [],
    }));
    updateUrlWithSession(session.id);
    return session;
  },

  selectSession: async (id: string, pushHistory = true) => {
    const session = get().sessions.find((s: SessionMeta) => s.id === id);
    set({
      currentSessionId: id,
      currentView: "chat" as MainView,
      messages: [],
      loadingSession: true,
      currentModelId: session?.modelId || get().currentModelId,
    });

    if (pushHistory) {
      pushSessionHistory(id);
    } else {
      updateUrlWithSession(id);
    }

    try {
      const rawMessages = await api.fetchSessionMessages(id);
      const { convertToChatMessages } = await import("./chat-helpers");
      const messages = convertToChatMessages(rawMessages);
      set({ messages, loadingSession: false });
    } catch (err: any) {
      console.error("加载消息失败:", err.message);
      set({ loadingSession: false });
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
    set((state: SessionState) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      const currentSessionId =
        state.currentSessionId === id ? (sessions[0]?.id || null) : state.currentSessionId;
      return { sessions, currentSessionId };
    });
    const { currentSessionId } = get();
    updateUrlWithSession(currentSessionId);
    try {
      await api.deleteSession(id);
    } catch (err: any) {
      console.error("删除失败:", err.message);
      get().loadSessions();
    }
  },

  deleteSessions: async (ids: string[]) => {
    set((state: SessionState) => {
      const remaining = state.sessions.filter((s) => !ids.includes(s.id));
      const currentSessionId = ids.includes(state.currentSessionId || "")
        ? (remaining[0]?.id || null)
        : state.currentSessionId;
      return { sessions: remaining, currentSessionId };
    });
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
    set((state: SessionState) => ({
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
    set((state: SessionState) => ({
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
});

/**
 * 从 URL 恢复会话状态（供 initApp 使用）
 */
export async function restoreSessionFromUrl(get: any): Promise<void> {
  const urlSessionId = getSessionIdFromUrl();
  if (!urlSessionId) return;

  const { sessions } = get();
  if (isValidSessionId(urlSessionId, sessions.map((s: SessionMeta) => s.id))) {
    await get().selectSession(urlSessionId, false);
  } else {
    console.warn("URL 中的会话 ID 无效，已清除:", urlSessionId);
    updateUrlWithSession(null);
  }
}
