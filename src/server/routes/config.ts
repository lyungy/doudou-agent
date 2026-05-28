/**
 * 配置路由：获取和更新 LLM 配置
 */
import { Router } from "express";
import { getConfig, saveConfig, listModels, type AppConfig } from "../services/config.js";

const router = Router();

/**
 * GET /api/config
 * 获取当前配置（隐藏 api_key）
 */
router.get("/", (req, res) => {
  try {
    const config = getConfig();
    // 隐藏敏感信息
    const safeConfig = {
      ...config,
      llm: {
        ...config.llm,
        api_key: config.llm.api_key ? "••••••" + config.llm.api_key.slice(-4) : "",
      },
    };
    res.json(safeConfig);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/config
 * 更新配置
 */
router.put("/", (req, res) => {
  try {
    const updates = req.body as Partial<AppConfig>;
    const current = getConfig();

    const newConfig: AppConfig = {
      llm: { ...current.llm, ...updates.llm },
      storage: { ...current.storage, ...updates.storage },
      server: { ...current.server, ...updates.server },
      logging: { ...current.logging, ...(updates as any).logging },
    };

    // 如果 api_key 是掩码，保留原值
    if (newConfig.llm.api_key && newConfig.llm.api_key.startsWith("••••••")) {
      newConfig.llm.api_key = current.llm.api_key;
    }

    saveConfig(newConfig);
    res.json({ ok: true, message: "配置已保存，重启后生效" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/models
 * 获取可用模型列表
 */
router.get("/models", (req, res) => {
  try {
    const models = listModels();
    res.json(models);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
