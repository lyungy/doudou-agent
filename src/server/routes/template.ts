/**
 * 模板路由：提示词模板的 CRUD
 */
import { Router } from "express";
import type { Request, Response } from "express";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  toggleTemplate,
} from "../services/template.js";

const router = Router();

/**
 * GET /api/templates
 * 获取模板列表
 * 查询参数：enabled=true 只返回启用的
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const enabledOnly = String(req.query.enabled || "") === "true";
    const templates = listTemplates(enabledOnly);
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/templates/:id
 * 获取单个模板（含 .md 内容）
 */
router.get("/:id", (req: Request, res: Response) => {
  try {
    const tpl = getTemplate(String(req.params.id));
    if (!tpl) {
      return res.status(404).json({ error: "模板不存在" });
    }
    res.json(tpl);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/templates
 * 创建模板
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const { name, description, icon, category, content } = req.body;
    if (!name) {
      return res.status(400).json({ error: "缺少模板名称" });
    }
    const tpl = createTemplate({ name, description, icon, category, content });
    res.json(tpl);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/templates/:id
 * 更新模板（元数据 + 内容）
 */
router.put("/:id", (req: Request, res: Response) => {
  try {
    const tpl = updateTemplate(String(req.params.id), req.body);
    if (!tpl) {
      return res.status(404).json({ error: "模板不存在" });
    }
    res.json(tpl);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/templates/:id
 * 删除模板
 */
router.delete("/:id", (req: Request, res: Response) => {
  try {
    const ok = deleteTemplate(String(req.params.id));
    if (!ok) {
      return res.status(404).json({ error: "模板不存在" });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/templates/:id/toggle
 * 启用/禁用模板
 */
router.patch("/:id/toggle", (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (enabled === undefined) {
      return res.status(400).json({ error: "缺少 enabled 参数" });
    }
    const ok = toggleTemplate(String(req.params.id), !!enabled);
    if (!ok) {
      return res.status(404).json({ error: "模板不存在" });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
