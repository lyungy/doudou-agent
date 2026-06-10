/**
 * 配置路由：获取和更新 LLM 配置 + 系统提示词
 */
import { Router } from "express";
import { getConfig, saveConfig, listModels, readSystemPrompt, writeSystemPrompt, getModelById, type AppConfig, type ProviderConfig } from "../services/config.js";
import { getAllAgents } from "../services/agent.js";
import { getLogger } from "../services/logger.js";

const router = Router();

/** 隐藏 provider 中的 api_key */
function maskProviders(providers: ProviderConfig[]) {
  return providers.map((p) => ({
    ...p,
    api_key: p.api_key ? "••••••" + p.api_key.slice(-4) : "",
  }));
}

/**
 * GET /api/config
 * 获取当前配置（隐藏 api_key）
 */
router.get("/", (req, res) => {
  try {
    const config = getConfig();
    const safeConfig = {
      ...config,
      llm: {
        ...config.llm,
        providers: maskProviders(config.llm.providers),
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
      llm: {
        ...current.llm,
        ...updates.llm,
        // 保留掩码 api_key 的 provider 原值
        providers: updates.llm?.providers
          ? updates.llm.providers.map((p: any) => ({
              ...p,
              api_key: (p.api_key && p.api_key.startsWith("••••••"))
                ? current.llm.providers.find((op) => op.name === p.name)?.api_key || p.api_key
                : p.api_key,
            }))
          : current.llm.providers,
      },
      storage: { ...current.storage, ...updates.storage },
      server: { ...current.server, ...updates.server },
      client: { ...current.client, ...(updates as any).client },
      logging: { ...current.logging, ...(updates as any).logging },
      context: { ...current.context, ...(updates as any).context },
      agent: { ...current.agent, ...(updates as any).agent },
    };

    saveConfig(newConfig);

    // S-07: 配置热更新 — 更新所有缓存 Agent 的 model，使其立即生效
    try {
      const newModel = getModelById();
      const agents = getAllAgents();
      for (const [id, agent] of agents) {
        if (agent.state.model?.id !== newModel.id) {
          getLogger().info("config", `热更新 Agent ${id} 模型: ${agent.state.model?.id} → ${newModel.id}`);
          agent.state.model = newModel;
        }
      }
    } catch {
      // 模型解析失败不影响配置保存
    }

    res.json({ ok: true, message: "配置已保存" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/models
 * 获取可用模型列表 + thinking_level 默认值
 */
router.get("/models", (req, res) => {
  try {
    const config = getConfig();
    const models = listModels();
    // 返回给前端时隐藏 apiKey 和 baseUrl（前端不需要）
    const safeModels = models.map(({ apiKey, baseUrl, ...rest }) => rest);
    res.json({
      models: safeModels,
      thinkingLevel: config.llm.thinking_level || "off",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/config/system-prompt
 * 读取系统提示词（AGENT.md）
 */
router.get("/system-prompt", (req, res) => {
  try {
    const content = readSystemPrompt();
    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/config/system-prompt
 * 保存系统提示词（AGENT.md）
 */
router.put("/system-prompt", (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== "string") {
      return res.status(400).json({ error: "content 必须是字符串" });
    }
    writeSystemPrompt(content);
    res.json({ ok: true, message: "系统提示词已保存，新建会话后生效" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
