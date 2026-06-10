/**
 * 定时任务调度器
 * - 任务 CRUD（JSON 文件持久化）
 * - Cron 调度（croner 库）
 * - 自动创建临时 Session 执行 LLM 任务
 * - 执行日志（JSONL 持久化）
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { Cron } from "croner";
import { getLogger } from "./logger.js";
import { getOrCreateAgent, removeAgent } from "./agent.js";
import { getModelById } from "./config.js";

/** 执行记录最大保留条数（超出时淘汰最旧的） */
const MAX_RUNS = 2000;

// ============ 类型定义 ============

/** 任务类型 */
export type TaskType = "once" | "recurring";

/** 任务状态 */
export type TaskStatus = "idle" | "running" | "disabled";

/** 执行状态 */
export type RunStatus = "running" | "success" | "failed" | "timeout";

/** 任务定义 */
export interface Task {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  type: TaskType;
  enabled: boolean;
  timeout: number;          // 超时时间（秒），默认 300
  modelId?: string;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
}

/** 执行记录 */
export interface TaskRun {
  id: string;
  taskId: string;
  taskName: string;
  sessionId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  error?: string;
  output?: string;
}

/** 创建/更新任务参数 */
export interface TaskInput {
  name: string;
  prompt: string;
  cron: string;
  type: TaskType;
  enabled?: boolean;
  timeout?: number;
  modelId?: string;
}

// ============ 调度器 ============

class TaskScheduler {
  private tasks: Task[] = [];
  private jobs: Map<string, Cron> = new Map();
  private tasksPath: string;
  private runsPath: string;
  private idCounter = 0;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.tasksPath = join(dataDir, "tasks.json");
    this.runsPath = join(dataDir, "task-runs.jsonl");
    this.loadTasks();
    this.pruneRuns();
    this.startAll();
  }

  // ============ 任务 CRUD ============

  /** 获取所有任务 */
  getAll(): Task[] {
    return [...this.tasks];
  }

  /** 获取单个任务 */
  getById(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  /** 创建任务 */
  create(input: TaskInput): Task {
    const task: Task = {
      id: `task-${Date.now()}-${++this.idCounter}`,
      name: input.name,
      prompt: input.prompt,
      cron: input.cron,
      type: input.type,
      enabled: input.enabled ?? true,
      timeout: input.timeout ?? 300,
      modelId: input.modelId,
      createdAt: new Date().toISOString(),
      runCount: 0,
    };

    this.tasks.push(task);
    this.saveTasks();

    if (task.enabled) {
      this.startJob(task);
    }

    getLogger().info("task", "任务已创建", { taskId: task.id, name: task.name, cron: task.cron });
    return task;
  }

  /** 更新任务 */
  update(id: string, input: Partial<TaskInput>): Task | null {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    const task = this.tasks[idx];

    // 停止旧任务
    this.stopJob(id);

    // 更新字段
    if (input.name !== undefined) task.name = input.name;
    if (input.prompt !== undefined) task.prompt = input.prompt;
    if (input.cron !== undefined) task.cron = input.cron;
    if (input.type !== undefined) task.type = input.type;
    if (input.enabled !== undefined) task.enabled = input.enabled;
    if (input.timeout !== undefined) task.timeout = input.timeout;
    if (input.modelId !== undefined) task.modelId = input.modelId;

    this.saveTasks();

    if (task.enabled) {
      this.startJob(task);
    }

    getLogger().info("task", "任务已更新", { taskId: task.id, name: task.name });
    return task;
  }

  /** 删除任务 */
  delete(id: string): boolean {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;

    this.stopJob(id);
    this.tasks.splice(idx, 1);
    this.saveTasks();

    getLogger().info("task", "任务已删除", { taskId: id });
    return true;
  }

  /** 启用/禁用任务 */
  toggle(id: string, enabled: boolean): Task | null {
    return this.update(id, { enabled });
  }

  /** 手动触发任务 */
  async trigger(id: string): Promise<TaskRun | null> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    return await this.executeTask(task);
  }

  // ============ 执行日志 ============

  /** 查询执行日志（支持筛选和分页） */
  getRuns(filter: {
    taskId?: string;
    status?: string;
    since?: string;
  } = {}, limit = 50, offset = 0): { runs: TaskRun[]; total: number } {
    const allRuns = this.loadRuns();

    // 筛选
    let filtered = allRuns;
    if (filter.taskId) {
      filtered = filtered.filter((r) => r.taskId === filter.taskId);
    }
    if (filter.status) {
      filtered = filtered.filter((r) => r.status === filter.status);
    }
    if (filter.since) {
      const sinceTs = new Date(filter.since).getTime();
      filtered = filtered.filter((r) => new Date(r.startedAt).getTime() >= sinceTs);
    }

    // 按时间倒序排列（最新在前）
    filtered.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    const total = filtered.length;
    const runs = filtered.slice(offset, offset + limit);
    return { runs, total };
  }

  /** 根据 runId 获取单条执行记录（含完整 output/error） */
  getRunById(runId: string): TaskRun | undefined {
    const allRuns = this.loadRuns();
    return allRuns.find((r) => r.id === runId);
  }

  /** 获取所有任务的执行统计 */
  getRunStats(): {
    total: number;
    success: number;
    failed: number;
    timeout: number;
    running: number;
    avgDuration: number;
    taskStats: { taskId: string; taskName: string; total: number; success: number; failed: number; avgDuration: number }[];
  } {
    const allRuns = this.loadRuns();
    const success = allRuns.filter((r) => r.status === "success").length;
    const failed = allRuns.filter((r) => r.status === "failed").length;
    const timeout = allRuns.filter((r) => r.status === "timeout").length;
    const running = allRuns.filter((r) => r.status === "running").length;
    const durations = allRuns.filter((r) => r.duration).map((r) => r.duration!);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // 按任务分组统计
    const taskMap = new Map<string, { taskName: string; runs: TaskRun[] }>();
    for (const run of allRuns) {
      const existing = taskMap.get(run.taskId);
      if (existing) {
        existing.runs.push(run);
      } else {
        taskMap.set(run.taskId, { taskName: run.taskName, runs: [run] });
      }
    }
    const taskStats = [...taskMap.entries()].map(([taskId, { taskName, runs }]) => {
      const rDurations = runs.filter((r) => r.duration).map((r) => r.duration!);
      return {
        taskId,
        taskName,
        total: runs.length,
        success: runs.filter((r) => r.status === "success").length,
        failed: runs.filter((r) => r.status === "failed" || r.status === "timeout").length,
        avgDuration: rDurations.length > 0 ? rDurations.reduce((a, b) => a + b, 0) / rDurations.length : 0,
      };
    });

    return { total: allRuns.length, success, failed, timeout, running, avgDuration, taskStats };
  }

  // ============ 内部方法 ============

  /** 启动所有已启用任务的调度 */
  private startAll(): void {
    for (const task of this.tasks) {
      if (task.enabled) {
        this.startJob(task);
      }
    }
    getLogger().info("task", "调度器已启动", { total: this.tasks.length, enabled: this.tasks.filter((t) => t.enabled).length });
  }

  /** 启动单个任务调度 */
  private startJob(task: Task): void {
    try {
      const job = new Cron(task.cron, { timezone: "Asia/Shanghai" }, () => {
        this.executeTask(task).catch((err) => {
          getLogger().error("task", "任务执行异常", { taskId: task.id, error: String(err) });
        });
      });

      // 计算下次执行时间
      const nextRun = job.nextRun();
      if (nextRun) {
        task.nextRunAt = nextRun.toISOString();
      }

      this.jobs.set(task.id, job);
      getLogger().debug("task", "任务调度已启动", { taskId: task.id, cron: task.cron, nextRun: task.nextRunAt });
    } catch (err) {
      getLogger().error("task", "任务调度启动失败", { taskId: task.id, cron: task.cron, error: String(err) });
    }
  }

  /** 停止单个任务调度 */
  private stopJob(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
  }

  /** 执行任务 */
  private async executeTask(task: Task): Promise<TaskRun> {
    const logger = getLogger();
    const runId = `run-${Date.now()}`;
    const sessionId = `task-${task.id}-${Date.now()}`;

    const run: TaskRun = {
      id: runId,
      taskId: task.id,
      taskName: task.name,
      sessionId,
      status: "running",
      startedAt: new Date().toISOString(),
    };

    // 追加写入日志
    this.appendRun(run);
    logger.info("task", "任务开始执行", { taskId: task.id, taskName: task.name, runId, sessionId });

    try {
      // 创建 Agent 并执行
      const model = getModelById(task.modelId);
      const { agent } = await getOrCreateAgent(sessionId, model);

      // 超时控制
      const timeoutMs = (task.timeout || 300) * 1000;
      const result = await Promise.race([
        agent.prompt(task.prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`任务超时（${task.timeout}秒）`)), timeoutMs)
        ),
      ]);

      await agent.waitForIdle();

      // 获取输出摘要
      const state = agent.state;
      const allMsgs = state.messages as any[];
      const lastAssistant = allMsgs.filter((m) => m.role === "assistant").pop();
      let output = "";
      if (lastAssistant && Array.isArray(lastAssistant.content)) {
        output = lastAssistant.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("");
      }

      // 清理 Agent 实例
      removeAgent(sessionId);

      run.status = "success";
      run.finishedAt = new Date().toISOString();
      run.duration = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
      run.output = output;

      logger.info("task", "任务执行成功", { taskId: task.id, runId, duration: run.duration });
    } catch (err: any) {
      run.status = err.message?.includes("超时") ? "timeout" : "failed";
      run.finishedAt = new Date().toISOString();
      run.duration = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
      run.error = err.message || String(err);

      logger.error("task", "任务执行失败", { taskId: task.id, runId, status: run.status, error: run.error });
    }

    // 更新任务状态
    task.lastRunAt = run.finishedAt;
    task.runCount++;
    // 更新下次执行时间
    const job = this.jobs.get(task.id);
    if (job) {
      const nextRun = job.nextRun();
      if (nextRun) task.nextRunAt = nextRun.toISOString();
    }

    // 一次性任务执行完自动禁用
    if (task.type === "once") {
      task.enabled = false;
      this.stopJob(task.id);
      logger.info("task", "一次性任务已完成，自动禁用", { taskId: task.id });
    }

    this.saveTasks();
    this.updateRun(run);

    // 定期清理超出上限的执行记录
    this.pruneRuns();

    return run;
  }

  // ============ 持久化 ============

  private loadTasks(): void {
    try {
      if (!existsSync(this.tasksPath)) {
        this.tasks = [];
        return;
      }
      const data = readFileSync(this.tasksPath, "utf-8");
      this.tasks = JSON.parse(data);
      this.idCounter = this.tasks.length;
    } catch {
      this.tasks = [];
    }
  }

  private saveTasks(): void {
    try {
      writeFileSync(this.tasksPath, JSON.stringify(this.tasks, null, 2), "utf-8");
    } catch (err) {
      getLogger().error("task", "任务保存失败", { error: String(err) });
    }
  }

  private loadRuns(): TaskRun[] {
    try {
      if (!existsSync(this.runsPath)) return [];
      const content = readFileSync(this.runsPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const runs: TaskRun[] = [];
      for (const line of lines) {
        try { runs.push(JSON.parse(line)); } catch { /* skip */ }
      }
      return runs;
    } catch {
      return [];
    }
  }

  private appendRun(run: TaskRun): void {
    try {
      appendFileSync(this.runsPath, JSON.stringify(run) + "\n", "utf-8");
    } catch { /* ignore */ }
  }

  private updateRun(run: TaskRun): void {
    try {
      const runs = this.loadRuns();
      const idx = runs.findIndex((r) => r.id === run.id);
      if (idx !== -1) {
        runs[idx] = run;
        writeFileSync(this.runsPath, runs.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
      }
    } catch { /* ignore */ }
  }

  /** 清理超出上限的旧执行记录，保留最新 MAX_RUNS 条 */
  private pruneRuns(): void {
    try {
      if (!existsSync(this.runsPath)) return;
      const content = readFileSync(this.runsPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      if (lines.length <= MAX_RUNS) return;
      // 按时间倒序，保留最新的 MAX_RUNS 条
      const runs: TaskRun[] = [];
      for (const line of lines) {
        try { runs.push(JSON.parse(line)); } catch { /* skip */ }
      }
      runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      const kept = runs.slice(0, MAX_RUNS);
      // 按时间正序写回
      kept.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      writeFileSync(this.runsPath, kept.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
      getLogger().info("task", `执行记录已清理：${lines.length} → ${kept.length} 条`);
    } catch { /* ignore */ }
  }
}

// ============ 单例 ============

let scheduler: TaskScheduler | null = null;

export function initTaskScheduler(dataDir: string): TaskScheduler {
  scheduler = new TaskScheduler(dataDir);
  return scheduler;
}

export function getTaskScheduler(): TaskScheduler {
  if (!scheduler) {
    scheduler = new TaskScheduler(join(process.cwd(), "data"));
  }
  return scheduler;
}

export { TaskScheduler };
