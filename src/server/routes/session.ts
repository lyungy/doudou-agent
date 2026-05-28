/**
 * Session 路由：会话的增删改查
 */
import { Router } from "express";
import {
  createSession,
  listSessions,
  getSession,
  updateSession,
  deleteSession,
  openSession,
} from "../services/session.js";
import { removeAgent } from "../services/agent.js";

const router = Router();

/**
 * GET /api/sessions
 * 获取 session 列表
 */
router.get("/", (req, res) => {
  try {
    const sessions = listSessions();
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sessions
 * 创建新 session
 */
router.post("/", async (req, res) => {
  try {
    const { title, modelId } = req.body || {};
    const session = await createSession(title, modelId);
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sessions/:id
 * 获取单个 session
 */
router.get("/:id", (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session 不存在" });
    }
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/sessions/:id
 * 更新 session（标题等）
 */
router.patch("/:id", (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session 不存在" });
    }

    // 只允许更新 title 和 modelId
    const { title, modelId } = req.body;
    updateSession(req.params.id, { title, modelId });
    const updated = getSession(req.params.id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/sessions/:id
 * 删除 session
 */
router.delete("/:id", async (req, res) => {
  try {
    const ok = await deleteSession(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: "Session 不存在" });
    }
    // 同时移除关联的 Agent 实例
    removeAgent(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sessions/:id/messages
 * 获取 session 的消息历史
 */
router.get("/:id/messages", async (req, res) => {
  try {
    const session = await openSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session 不存在" });
    }

    const context = await session.buildContext();
    res.json(context.messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sessions/batch-delete
 * 批量删除 session
 */
router.post("/batch-delete", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "缺少 ids 数组" });
    }

    let deleted = 0;
    for (const id of ids) {
      try {
        const ok = await deleteSession(id);
        if (ok) {
          removeAgent(id);
          deleted++;
        }
      } catch {
        // 单个删除失败不影响其他
      }
    }

    res.json({ ok: true, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
