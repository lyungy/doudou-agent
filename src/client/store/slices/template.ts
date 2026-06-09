/**
 * 提示词模板 slice
 */
import type { PromptTemplate } from "../../types";
import * as api from "../../lib/client";

export interface TemplateState {
  templates: PromptTemplate[];
  loadingTemplates: boolean;
  pendingTemplateContent: string | null;
}

export interface TemplateActions {
  loadTemplates: () => Promise<void>;
  fillTemplate: (template: PromptTemplate) => Promise<void>;
  clearPendingTemplate: () => void;
}

export type TemplateSlice = TemplateState & TemplateActions;

export const createTemplateSlice = (set: any): TemplateSlice => ({
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
    try {
      const full = await api.fetchTemplate(template.id);
      if (full.content) {
        set({ pendingTemplateContent: full.content });
      }
    } catch (err: any) {
      // 加载失败静默处理，UI 显示空状态
    }
  },
  clearPendingTemplate: () => set({ pendingTemplateContent: null }),
});
