/**
 * 定时任务路由
 * GET    /api/tasks              — 获取所有任务
 * POST   /api/tasks              — 创建任务
 * PUT    /api/tasks/:id          — 更新任务
 * DELETE /api/tasks/:id          — 删除任务
 * POST   /api/tasks/:id/toggle   — 启用/禁用
 * POST   /api/tasks/:id/trigger  — 手动触发
 * GET    /api/tasks/:id/runs     — 查询任务执行日志
 * GET    /api/tasks/runs         — 查询所有执行日志
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { getTaskScheduler, type TaskInput } from "../services/task-scheduler.js";

const router = Router();

/** GET / — 获取所有任务 */
router.get("/", (_req: Request, res: Response) => {
  const scheduler = getTaskScheduler();
  res.json({ tasks: scheduler.getAll() });
});

/** POST / — 创建任务 */
router.post("/", (req: Request, res: Response) => {
  const { name, prompt, cron, type, enabled, timeout, modelId } = req.body;

  if (!name || !prompt || !cron || !type) {
    return res.status(400).json({ error: "缺少必填字段: name, prompt, cron, type" });
  }

  const input: TaskInput = { name, prompt, cron, type, enabled, timeout, modelId };
  const scheduler = getTaskScheduler();
  const task = scheduler.create(input);
  res.status(201).json({ task });
});

/** PUT /:id — 更新任务 */
router.put("/:id", (req: Request, res: Response) => {
  const scheduler = getTaskScheduler();
  const task = scheduler.update(req.params.id as string, req.body);
  if (!task) return res.status(404).json({ error: "任务不存在" });
  res.json({ task });
});

/** DELETE /:id — 删除任务 */
router.delete("/:id", (req: Request, res: Response) => {
  const scheduler = getTaskScheduler();
  const ok = scheduler.delete(req.params.id as string);
  if (!ok) return res.status(404).json({ error: "任务不存在" });
  res.json({ ok: true });
});

/** POST /:id/toggle — 启用/禁用 */
router.post("/:id/toggle", (req: Request, res: Response) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "缺少 enabled 字段（boolean）" });
  }
  const scheduler = getTaskScheduler();
  const task = scheduler.toggle(req.params.id as string, enabled);
  if (!task) return res.status(404).json({ error: "任务不存在" });
  res.json({ task });
});

/** POST /:id/trigger — 手动触发 */
router.post("/:id/trigger", async (req: Request, res: Response) => {
  const scheduler = getTaskScheduler();
  const run = await scheduler.trigger(req.params.id as string);
  if (!run) return res.status(404).json({ error: "任务不存在" });
  res.json({ run });
});

/** GET /runs — 查询所有执行日志（支持筛选和分页） */
router.get("/runs", (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
  const filter = {
    status: req.query.status as string | undefined,
    since: req.query.since as string | undefined,
  };
  const scheduler = getTaskScheduler();
  const result = scheduler.getRuns(filter, limit, offset);
  res.json({ runs: result.runs, total: result.total });
});

/** GET /runs/stats — 任务执行统计分析 */
router.get("/runs/stats", (_req: Request, res: Response) => {
  const scheduler = getTaskScheduler();
  const stats = scheduler.getRunStats();
  res.json(stats);
});

/** GET /runs/:runId — 单条执行详情（含完整 output/error） */
router.get("/runs/:runId", (req: Request, res: Response) => {
  const scheduler = getTaskScheduler();
  const run = scheduler.getRunById(req.params.runId as string);
  if (!run) return res.status(404).json({ error: "执行记录不存在" });
  // 附带任务定义（含 prompt）
  const task = scheduler.getById(run.taskId);
  res.json({ run, task: task ? { prompt: task.prompt, cron: task.cron, type: task.type } : null });
});

/** GET /:id/runs — 查询指定任务执行日志（支持筛选和分页） */
router.get("/:id/runs", (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
  const filter = {
    taskId: req.params.id as string,
    status: req.query.status as string | undefined,
    since: req.query.since as string | undefined,
  };
  const scheduler = getTaskScheduler();
  const result = scheduler.getRuns(filter, limit, offset);
  res.json({ runs: result.runs, total: result.total });
});

export default router;
