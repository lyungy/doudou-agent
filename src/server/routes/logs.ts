/**
 * 日志查询路由
 * GET /api/logs          — 日志列表查询
 * GET /api/logs/llm-requests — LLM 请求记录查询
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { getLogger, type LogLevel } from "../services/logger.js";
import { getLLMTracker } from "../services/llm-tracker.js";

const router = Router();

/**
 * GET /api/logs — 查询日志
 * 查询参数：
 *   level  — 过滤最低级别（debug/info/warn/error）
 *   module — 过滤模块（http/llm/agent/sse/system）
 *   since  — 起始时间（ISO 8601）
 *   limit  — 数量限制（默认 100）
 *   offset — 偏移量
 */
router.get("/", (req: Request, res: Response) => {
  const logger = getLogger();

  const filter = {
    level: req.query.level as LogLevel | undefined,
    module: req.query.module as string | undefined,
    since: req.query.since as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
  };

  const result = logger.query(filter);
  res.json(result);
});

/**
 * GET /api/logs/llm-requests — 查询 LLM 请求记录
 * 查询参数：
 *   sessionId — 过滤 session
 *   limit     — 数量限制（默认 50）
 */
router.get("/llm-requests", (req: Request, res: Response) => {
  const tracker = getLLMTracker();
  const sessionId = req.query.sessionId as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

  // 合并活跃请求 + 最近完成请求
  const active = tracker.getActive();
  const recent = sessionId
    ? tracker.getBySession(sessionId, limit)
    : tracker.getRecent(limit);

  const requests = [...active, ...recent].slice(0, limit);

  res.json({ requests });
});

export default router;
