/**
 * cron 命令 — 定时任务管理（直调 TaskScheduler）
 */
import { initCLI } from "../lib/init.js";
import { bold, success, error, dim, formatTime, printTable } from "../lib/format.js";
import { createSpinner } from "../lib/spinner.js";

/**
 * 列出所有任务
 */
export async function cronList(): Promise<void> {
  initCLI();
  const { getTaskScheduler } = await import("../../server/services/task-scheduler.js");
  const scheduler = getTaskScheduler();
  const tasks = scheduler.getAll();

  if (tasks.length === 0) {
    console.log(dim("暂无定时任务"));
    return;
  }

  console.log(bold(`\n📋 定时任务（${tasks.length} 个）\n`));

  const headers = ["ID", "名称", "Cron", "类型", "状态", "执行次数", "上次执行", "下次执行"];
  const rows = tasks.map((t) => [
    t.id.slice(0, 20),
    t.name,
    t.cron,
    t.type,
    t.enabled ? "● 启用" : "○ 禁用",
    String(t.runCount),
    t.lastRunAt ? formatTime(t.lastRunAt) : "-",
    t.nextRunAt ? formatTime(t.nextRunAt) : "-",
  ]);

  printTable(headers, rows);
}

/**
 * 创建任务
 */
export async function cronAdd(json: string): Promise<void> {
  initCLI();
  const { getTaskScheduler } = await import("../../server/services/task-scheduler.js");

  let input: any;
  try {
    input = JSON.parse(json);
  } catch {
    console.log(error("JSON 格式错误"));
    process.exit(1);
  }

  // 验证必填字段
  if (!input.name || !input.prompt || !input.cron) {
    console.log(error("缺少必填字段: name, prompt, cron"));
    process.exit(1);
  }

  if (!input.type) input.type = "recurring";

  const scheduler = getTaskScheduler();
  const task = scheduler.create(input);
  console.log(success(`✓ 任务已创建: ${task.id}`));
  console.log(dim(`  名称: ${task.name}`));
  console.log(dim(`  Cron: ${task.cron}`));
  console.log(dim(`  下次执行: ${task.nextRunAt ? formatTime(task.nextRunAt) : "-"}`));
}

/**
 * 删除任务
 */
export async function cronRemove(id: string): Promise<void> {
  initCLI();
  const { getTaskScheduler } = await import("../../server/services/task-scheduler.js");
  const scheduler = getTaskScheduler();

  if (scheduler.delete(id)) {
    console.log(success(`✓ 任务已删除: ${id}`));
  } else {
    console.log(error(`任务不存在: ${id}`));
    process.exit(1);
  }
}

/**
 * 手动触发任务
 */
export async function cronTrigger(id: string): Promise<void> {
  initCLI();
  const { getTaskScheduler } = await import("../../server/services/task-scheduler.js");
  const scheduler = getTaskScheduler();

  const task = scheduler.getById(id);
  if (!task) {
    console.log(error(`任务不存在: ${id}`));
    process.exit(1);
  }

  const spinner = createSpinner(`正在执行任务: ${task.name}...`);
  spinner.start();

  try {
    const run = await scheduler.trigger(id);
    spinner.stop();

    if (!run) {
      console.log(error("任务触发失败"));
      process.exit(1);
    }

    if (run.status === "success") {
      console.log(success(`✓ 任务执行成功`));
      console.log(dim(`  耗时: ${run.duration}ms`));
      if (run.output) {
        console.log(dim(`  输出: ${run.output.slice(0, 200)}`));
      }
    } else {
      console.log(error(`✗ 任务执行失败: ${run.status}`));
      if (run.error) {
        console.log(dim(`  错误: ${run.error}`));
      }
    }
  } catch (err: any) {
    spinner.fail(error(`执行异常: ${err.message}`));
    process.exit(1);
  }
}

/**
 * 启用任务
 */
export async function cronEnable(id: string): Promise<void> {
  initCLI();
  const { getTaskScheduler } = await import("../../server/services/task-scheduler.js");
  const scheduler = getTaskScheduler();

  const task = scheduler.toggle(id, true);
  if (task) {
    console.log(success(`✓ 任务已启用: ${task.name}`));
  } else {
    console.log(error(`任务不存在: ${id}`));
    process.exit(1);
  }
}

/**
 * 禁用任务
 */
export async function cronDisable(id: string): Promise<void> {
  initCLI();
  const { getTaskScheduler } = await import("../../server/services/task-scheduler.js");
  const scheduler = getTaskScheduler();

  const task = scheduler.toggle(id, false);
  if (task) {
    console.log(success(`✓ 任务已禁用: ${task.name}`));
  } else {
    console.log(error(`任务不存在: ${id}`));
    process.exit(1);
  }
}
