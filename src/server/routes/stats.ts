/**
 * 统计看板路由
 * GET /api/stats/overview    → 概览数字
 * GET /api/stats/daily       → 每日趋势
 * GET /api/stats/models      → 模型使用分布
 * GET /api/stats/performance → 耗时统计
 * GET /api/stats/errors      → 错误统计
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../services/session.js";
import { getLLMTracker, type LLMRequestRecord } from "../services/llm-tracker.js";
import { getTaskScheduler } from "../services/task-scheduler.js";

const router = Router();

// ============ 内存缓存（30s） ============

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 30_000; // 30 秒

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

// ============ 工具函数 ============



/** 获取所有 LLM 请求记录（合并内存 + 磁盘） */
function getAllLLMRequests(): LLMRequestRecord[] {
  const tracker = getLLMTracker();
  return tracker.getRecent(10000);
}

/** 获取任务执行记录 */
function getTaskRuns(): any[] {
  try {
    return getTaskScheduler().getRuns({}, 1000).runs;
  } catch {
    return [];
  }
}

/** 生成最近 N 天的日期列表 */
function recentDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** 按日期分组计数 */
function groupByDate(records: { startTime: number }[], days: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of days) map.set(d, 0);
  for (const r of records) {
    const date = new Date(r.startTime).toISOString().slice(0, 10);
    if (map.has(date)) {
      map.set(date, (map.get(date) || 0) + 1);
    }
  }
  return map;
}

/** 按日期分组 session 创建数 */
function groupSessionsByDate(rows: any[], days: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of days) map.set(d, 0);
  for (const row of rows) {
    const date = row.created_at?.slice(0, 10);
    if (date && map.has(date)) {
      map.set(date, (map.get(date) || 0) + 1);
    }
  }
  return map;
}

/** 按日期分组 session 消息数 */
function groupMessagesByDate(rows: any[], days: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of days) map.set(d, 0);
  for (const row of rows) {
    const date = row.created_at?.slice(0, 10);
    if (date && map.has(date)) {
      map.set(date, (map.get(date) || 0) + (row.message_count || 0));
    }
  }
  return map;
}

// ============ 路由 ============

/**
 * GET /api/stats/overview — 概览数字
 */
router.get("/overview", (req: Request, res: Response) => {
  const cached = getCached<any>("overview");
  if (cached) return res.json(cached);

  try {
    const db = getDb();

    // Session 统计
    const sessionStats = db
      .prepare("SELECT COUNT(*) as count, COALESCE(SUM(message_count), 0) as totalMessages FROM sessions")
      .get() as { count: number; totalMessages: number };

    // LLM 请求统计
    const llmRequests = getAllLLMRequests();
    const completedRequests = llmRequests.filter((r) => r.status === "completed");
    const totalTokens = completedRequests.reduce(
      (sum, r) => sum + (r.inputTokens || 0) + (r.outputTokens || 0),
      0
    );

    const result = {
      totalSessions: sessionStats.count,
      totalMessages: sessionStats.totalMessages,
      totalLLMRequests: llmRequests.length,
      totalTokens,
    };

    setCache("overview", result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats/daily?days=7 — 每日趋势
 */
router.get("/daily", (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string, 10) || 7;
  const cacheKey = `daily-${days}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    const dayList = recentDays(days);

    // Session 创建按天
    const sessions = db.prepare("SELECT created_at FROM sessions").all() as any[];
    const sessionsByDate = groupSessionsByDate(sessions, dayList);

    // Session 消息按天
    const messagesByDate = groupMessagesByDate(sessions, dayList);

    // LLM 请求按天
    const llmRequests = getAllLLMRequests();
    const llmByDate = groupByDate(llmRequests, dayList);

    const result = {
      days: dayList.map((date) => ({
        date,
        sessions: sessionsByDate.get(date) || 0,
        messages: messagesByDate.get(date) || 0,
        llmRequests: llmByDate.get(date) || 0,
      })),
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats/models — 模型使用分布
 */
router.get("/models", (req: Request, res: Response) => {
  const cached = getCached<any>("models");
  if (cached) return res.json(cached);

  try {
    const llmRequests = getAllLLMRequests();
    const counts = new Map<string, number>();

    for (const r of llmRequests) {
      const model = r.modelId || "unknown";
      counts.set(model, (counts.get(model) || 0) + 1);
    }

    const models = Array.from(counts.entries())
      .map(([modelId, count]) => ({ modelId, count }))
      .sort((a, b) => b.count - a.count);

    const result = { models };
    setCache("models", result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats/performance?days=7 — 耗时统计
 */
router.get("/performance", (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string, 10) || 7;
  const cacheKey = `performance-${days}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const llmRequests = getAllLLMRequests().filter((r) => r.status === "completed");
    const dayList = recentDays(days);

    const result = {
      days: dayList.map((date) => {
        const dayRequests = llmRequests.filter(
          (r) => new Date(r.startTime).toISOString().slice(0, 10) === date
        );

        if (dayRequests.length === 0) {
          return {
            date,
            avgTTFT: 0,
            avgDuration: 0,
            p50TTFT: 0,
            p95TTFT: 0,
            requestCount: 0,
          };
        }

        const ttfts = dayRequests
          .map((r) => r.ttft || 0)
          .filter((t) => t > 0)
          .sort((a, b) => a - b);

        const durations = dayRequests
          .map((r) => r.duration || 0)
          .filter((d) => d > 0)
          .sort((a, b) => a - b);

        const avg = (arr: number[]) =>
          arr.length === 0 ? 0 : Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

        const percentile = (arr: number[], p: number) => {
          if (arr.length === 0) return 0;
          const idx = Math.ceil(arr.length * p) - 1;
          return arr[Math.max(0, idx)];
        };

        return {
          date,
          avgTTFT: avg(ttfts),
          avgDuration: avg(durations),
          p50TTFT: percentile(ttfts, 0.5),
          p95TTFT: percentile(ttfts, 0.95),
          requestCount: dayRequests.length,
        };
      }),
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats/errors?days=7 — 错误统计
 */
router.get("/errors", (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string, 10) || 7;
  const cacheKey = `errors-${days}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const dayList = recentDays(days);

    // LLM 错误
    const llmRequests = getAllLLMRequests();
    const llmErrors = llmRequests.filter((r) => r.status === "error");
    const llmErrorsByDate = groupByDate(
      llmErrors.map((r) => ({ startTime: r.startTime })),
      dayList
    );

    // 任务失败
    const taskRuns = getTaskRuns();
    const taskFailures = taskRuns.filter(
      (r) => r.status === "failed" || r.status === "timeout"
    );
    const taskFailuresByDate = new Map<string, number>();
    for (const d of dayList) taskFailuresByDate.set(d, 0);
    for (const r of taskFailures) {
      const date = r.startedAt?.slice(0, 10);
      if (date && taskFailuresByDate.has(date)) {
        taskFailuresByDate.set(date, (taskFailuresByDate.get(date) || 0) + 1);
      }
    }

    const result = {
      days: dayList.map((date) => ({
        date,
        llmErrors: llmErrorsByDate.get(date) || 0,
        taskFailures: taskFailuresByDate.get(date) || 0,
      })),
      totalLLMErrors: llmErrors.length,
      totalTaskFailures: taskFailures.length,
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
