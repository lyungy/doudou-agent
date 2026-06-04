/**
 * 系统提示词 slice
 */
import * as api from "../../lib/client";

export interface PromptState {
  systemPrompt: string;
  loadingSystemPrompt: boolean;
}

export interface PromptActions {
  loadSystemPrompt: () => Promise<void>;
  saveSystemPrompt: (content: string) => Promise<void>;
}

export type PromptSlice = PromptState & PromptActions;

export const createPromptSlice = (set: any): PromptSlice => ({
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
});
