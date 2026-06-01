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

  /** 查询执行日志 */
  getRuns(taskId?: string, limit = 50): TaskRun[] {
    const runs = this.loadRuns();
    const filtered = taskId ? runs.filter((r) => r.taskId === taskId) : runs;
    return filtered.slice(0, limit);
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
      const agent = await getOrCreateAgent(sessionId, model);

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
          .join("")
          .slice(0, 500);
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
      run.error = err.message?.slice(0, 500) || String(err);

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
