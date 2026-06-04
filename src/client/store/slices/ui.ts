/**
 * UI 状态 slice
 * 管理视图切换、日志子视图、思考等级
 */
import type { MainView, LogSubView, ThinkingLevel } from "../../types";

export interface UIState {
  currentView: MainView;
  logSubView: LogSubView;
  thinkingLevel: ThinkingLevel;
}

export interface UIActions {
  setCurrentView: (view: MainView) => void;
  setLogSubView: (view: LogSubView) => void;
  setThinkingLevel: (level: ThinkingLevel) => void;
}

export type UISlice = UIState & UIActions;

export const createUISlice = (set: any): UISlice => ({
  currentView: "home" as MainView,
  logSubView: "system" as LogSubView,
  thinkingLevel: "medium" as ThinkingLevel,

  setCurrentView: (view) => set({ currentView: view }),
  setLogSubView: (view) => set({ logSubView: view }),
  setThinkingLevel: (level) => set({ thinkingLevel: level }),
});
