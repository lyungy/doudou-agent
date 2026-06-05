/**
 * 日志查询路由
 * GET /api/logs          — 日志列表查询
 * GET /api/logs/llm-requests — LLM 请求记录查询
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { getLogger, type LogLevel } from "../services/logger.js";
import { getLLMTracker } from "../services/llm-tracker.js";
import { estimateContextTokens } from "../services/agent.js";

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
 *   status    — 过滤状态（connecting/streaming/completed/error/aborted）
 *   modelId   — 过滤模型
 *   since     — 起始时间（ISO 8601）
 *   limit     — 数量限制（默认 50）
 *   offset    — 偏移量（默认 0）
 */
router.get("/llm-requests", (req: Request, res: Response) => {
  const tracker = getLLMTracker();
  const filter = {
    sessionId: req.query.sessionId as string | undefined,
    status: req.query.status as string | undefined,
    modelId: req.query.modelId as string | undefined,
    since: req.query.since as string | undefined,
  };
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

  const result = tracker.query(filter, limit, offset);
  // 合并活跃请求（仅在无 offset 且第一页时）
  let active: any[] = [];
  if (offset === 0) {
    active = tracker.getActive();
    if (filter.sessionId) active = active.filter((r) => r.sessionId === filter.sessionId);
    if (filter.status) active = active.filter((r) => r.status === filter.status);
    if (filter.modelId) active = active.filter((r) => r.modelId === filter.modelId);
  }

  const requests = [...active, ...result.records];

  res.json({ requests, total: result.total + active.length });
});

/**
 * GET /api/logs/llm-requests/models — 获取所有模型 ID（供筛选下拉用）
 */
router.get("/llm-requests/models", (_req: Request, res: Response) => {
  const tracker = getLLMTracker();
  res.json({ models: tracker.getModelIds() });
});

/**
 * GET /api/logs/cumulative-tokens — 累计指定 session 的 token 用量
 * 查询参数：sessionId（必填）
 */
router.get("/cumulative-tokens", (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  const tracker = getLLMTracker();
  const tokens = tracker.getCumulativeTokens(sessionId);
  // 如果 llm-tracker 中没有 contextTokens，从 agent 当前状态兜底
  if (!tokens.contextTokens) {
    const estimated = estimateContextTokens(sessionId);
    if (estimated !== null) tokens.contextTokens = estimated;
  }
  res.json(tokens);
});

export default router;
