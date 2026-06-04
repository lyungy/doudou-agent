/**
 * stats 命令 — 统计概览（直查 SQLite + JSONL）
 */
import { initCLI } from "../lib/init.js";
import { bold, dim, success, formatNumber, printTable } from "../lib/format.js";

/**
 * 显示统计概览
 */
export async function showStats(): Promise<void> {
  initCLI();

  const { getDb } = await import("../../server/services/session.js");
  const { getLLMTracker } = await import("../../server/services/llm-tracker.js");
  const { getTaskScheduler } = await import("../../server/services/task-scheduler.js");

  const db = getDb();

  console.log(bold("\n📊 Doudou Agent 统计概览\n"));

  // Session 统计
  const sessionStats = db
    .prepare("SELECT COUNT(*) as count, COALESCE(SUM(message_count), 0) as totalMessages FROM sessions")
    .get() as { count: number; totalMessages: number };

  // LLM 请求统计
  const tracker = getLLMTracker();
  const llmRequests = tracker.getRecent(10000);
  const completedRequests = llmRequests.filter((r) => r.status === "completed");
  const totalTokens = completedRequests.reduce(
    (sum, r) => sum + (r.inputTokens || 0) + (r.outputTokens || 0),
    0
  );
  const errorRequests = llmRequests.filter((r) => r.status === "error");

  // 任务统计
  let taskCount = 0;
  let enabledTaskCount = 0;
  let taskRunCount = 0;
  try {
    const scheduler = getTaskScheduler();
    const tasks = scheduler.getAll();
    taskCount = tasks.length;
    enabledTaskCount = tasks.filter((t) => t.enabled).length;
    const runsResult = scheduler.getRuns({}, 10000);
    taskRunCount = runsResult.total;
  } catch {
    // 任务调度器可能未初始化
  }

  // 模型分布
  const modelCounts = new Map<string, number>();
  for (const r of llmRequests) {
    const m = r.modelId || "unknown";
    modelCounts.set(m, (modelCounts.get(m) || 0) + 1);
  }
  const topModels = Array.from(modelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 终端表格
  const headers = ["指标", "数值"];
  const rows = [
    ["Sessions", formatNumber(sessionStats.count)],
    ["消息总数", formatNumber(sessionStats.totalMessages)],
    ["LLM 请求", formatNumber(llmRequests.length)],
    ["  成功", formatNumber(completedRequests.length)],
    ["  失败", formatNumber(errorRequests.length)],
    ["Token 用量", formatNumber(totalTokens)],
    ["定时任务", `${taskCount}（${enabledTaskCount} 启用）`],
    ["任务执行", formatNumber(taskRunCount)],
  ];

  printTable(headers, rows);

  // 模型分布
  if (topModels.length > 0) {
    console.log(bold("\n📈 模型使用分布\n"));
    const modelHeaders = ["模型", "请求次数", "占比"];
    const modelRows = topModels.map(([model, count]) => [
      model,
      formatNumber(count),
      `${((count / llmRequests.length) * 100).toFixed(1)}%`,
    ]);
    printTable(modelHeaders, modelRows);
  }

  console.log("");
}
