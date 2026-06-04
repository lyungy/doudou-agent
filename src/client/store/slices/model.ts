/**
 * 模型状态 slice
 * 管理模型列表加载和当前模型切换
 */
import type { ModelDef, ThinkingLevel } from "../../types";
import * as api from "../../lib/client";

export interface ModelState {
  models: ModelDef[];
  currentModelId: string;
  loadingModels: boolean;
}

export interface ModelActions {
  loadModels: () => Promise<void>;
  setModel: (modelId: string) => void;
}

export type ModelSlice = ModelState & ModelActions;

export const createModelSlice = (set: any, get: any): ModelSlice => ({
  models: [],
  currentModelId: "",
  loadingModels: false,

  loadModels: async () => {
    set({ loadingModels: true });
    try {
      const { models, thinkingLevel } = await api.fetchModels();
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
});
