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
import { readdir, open, stat } from "fs/promises";
import { resolve } from "path";
import { getConfig } from "../services/config.js";

const router = Router();

/**
 * GET /api/sessions
 * 获取 session 列表
 * 查询参数：q（搜索关键词）、content=true（搜消息内容）
 */
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q as string || "").trim().toLowerCase();
    const searchContent = req.query.content === "true";

    let sessions = await listSessions();

    if (q) {
      // 标题搜索（始终生效）
      sessions = sessions.filter((s) => s.title.toLowerCase().includes(q));

      // 消息内容搜索（content=true 时额外搜 JSONL）
      if (searchContent) {
        const config = getConfig();
        const dataDir = config.storage.data_dir;
        const sessionsDir = resolve(dataDir, "sessions");
        const matchedIds = new Set(sessions.map((s) => s.id));

        // 遍历所有 JSONL 文件搜索消息内容
        try {
          const dirs = await readdir(sessionsDir);
          // 限制最多搜 200 个 session 目录
          const dirsToSearch = dirs.slice(0, 200);

          await Promise.all(
            dirsToSearch.map(async (dir) => {
              if (matchedIds.has(dir)) return; // 标题已匹配的跳过
              try {
                const jsonlPath = resolve(sessionsDir, dir, "session.jsonl");
                const st = await stat(jsonlPath).catch(() => null);
                if (!st) return;

                // 超 1MB 只读最后 50KB
                const readSize = Math.min(st.size, 50 * 1024);
                const buffer = Buffer.alloc(readSize);
                const fh = await open(jsonlPath, "r");
                try {
                  await fh.read(buffer, 0, readSize, st.size - readSize);
                } finally {
                  await fh.close();
                }

                const text = buffer.toString("utf-8").toLowerCase();
                if (text.includes(q)) {
                  // 命中，从数据库查出 session 元数据
                  const meta = getSession(dir);
                  if (meta) sessions.push(meta);
                  matchedIds.add(dir);
                }
              } catch {
                // 单个文件搜索失败不影响其他
              }
            })
          );
        } catch {
          // 目录读取失败忽略
        }

        // 搜索结果限 50 条
        if (sessions.length > 50) sessions = sessions.slice(0, 50);
      }
    }

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

    // 只允许更新 title、modelId 和 pinned
    const { title, modelId, pinned } = req.body;
    updateSession(req.params.id, { title, modelId, pinned });
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
    // 调试：打印消息角色分布
    const roles = context.messages.map((m: any) => m.role);
    const toolResultCount = roles.filter((r: string) => r === "toolResult").length;
    console.log("[session/messages] total:", context.messages.length, "roles:", [...new Set(roles)], "toolResults:", toolResultCount);
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
