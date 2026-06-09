/**
 * UI 状态 slice
 * 管理视图切换、日志子视图、思考等级、Toast 通知
 */
import type { MainView, LogSubView, ThinkingLevel } from "../../types";

/** Toast 消息 */
export interface ToastItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration: number;
}

export interface UIState {
  currentView: MainView;
  logSubView: LogSubView;
  thinkingLevel: ThinkingLevel;
  toasts: ToastItem[];
}

export interface UIActions {
  setCurrentView: (view: MainView) => void;
  setLogSubView: (view: LogSubView) => void;
  setThinkingLevel: (level: ThinkingLevel) => void;
  addToast: (type: ToastItem["type"], message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

export type UISlice = UIState & UIActions;

export const createUISlice = (set: any): UISlice => ({
  currentView: "home" as MainView,
  logSubView: "system" as LogSubView,
  thinkingLevel: "medium" as ThinkingLevel,
  toasts: [],

  setCurrentView: (view) => set({ currentView: view }),
  setLogSubView: (view) => set({ logSubView: view }),
  setThinkingLevel: (level) => set({ thinkingLevel: level }),

  addToast: (type, message, duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((state: UIState) => ({
      toasts: [...state.toasts, { id, type, message, duration }],
    }));
  },

  removeToast: (id) => {
    set((state: UIState) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
});
