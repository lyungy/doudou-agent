/**
 * Zustand 全局状态管理
 * 组合各领域 slice，导出统一的 useAppStore
 */
import { create } from "zustand";
import { updateUrlWithSession } from "../lib/url";
import { restoreSessionFromUrl } from "./slices/session";

// Slice 类型
import type { UISlice } from "./slices/ui";
import type { ModelSlice } from "./slices/model";
import type { PromptSlice } from "./slices/prompt";
import type { TemplateSlice } from "./slices/template";
import type { TaskSlice } from "./slices/task";
import type { SessionSlice } from "./slices/session";
import type { ChatSlice } from "./slices/chat";

// Slice 工厂
import { createUISlice } from "./slices/ui";
import { createModelSlice } from "./slices/model";
import { createPromptSlice } from "./slices/prompt";
import { createTemplateSlice } from "./slices/template";
import { createTaskSlice } from "./slices/task";
import { createSessionSlice } from "./slices/session";
import { createChatSlice } from "./slices/chat";

/** 完整 AppState = 所有 slice 的联合类型 */
type AppState = UISlice & ModelSlice & PromptSlice & TemplateSlice & TaskSlice & SessionSlice & ChatSlice & {
  initApp: () => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  // 组合所有 slice
  ...createUISlice(set),
  ...createModelSlice(set, get),
  ...createPromptSlice(set),
  ...createTemplateSlice(set),
  ...createTaskSlice(set),
  ...createSessionSlice(set, get),
  ...createChatSlice(set, get),

  // 初始化（页面加载时调用，从 URL 恢复会话状态）
  initApp: async () => {
    // 1. 加载模型列表（失败不影响后续）
    try {
      await get().loadModels();
    } catch (err: any) {
      
    }
    // 2. 加载会话列表（失败不影响后续）
    try {
      await get().loadSessions();
    } catch (err: any) {
      
    }
    // 3. 从 URL 恢复会话状态
    try {
      await restoreSessionFromUrl(get);
    } catch (err: any) {
      
      updateUrlWithSession(null);
    }
  },
}));
