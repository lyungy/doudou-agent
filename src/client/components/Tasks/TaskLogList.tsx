/**
 * 任务执行日志列表
 * 支持筛选（状态、时间范围）+ 统计分析面板
 */
import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../../store";
import * as api from "../../lib/client";
import { Pagination } from "../common/Pagination";
import { resolveTimeRange } from "../Logs/LogFilters";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "running", label: "执行中" },
  { value: "success", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "timeout", label: "超时" },
];

const TIME_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部时间" },
  { value: "1h", label: "最近 1 小时" },
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" },
];

/** 将时间范围快捷值转为 ISO 8601（扩展支持 7d/30d） */
function resolveTaskTimeRange(since: string): string | undefined {
  if (!since) return undefined;
  const now = new Date();
  const map: Record<string, number> = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const ms = map[since];
  if (!ms) return undefined;
  return new Date(now.getTime() - ms).toISOString();
}

export function TaskLogList() {
  const { taskRuns, taskRunsTotal, loadingTaskRuns, loadTaskRuns } = useAppStore();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [since, setSince] = useState("");
  const pageSize = 30;

  // 统计数据
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.fetchTaskRunStats>> | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const s = await api.fetchTaskRunStats();
      setStats(s);
    } catch {
      // 静默失败
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadTaskRuns({
      status: status || undefined,
      since: resolveTaskTimeRange(since),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  }, [page, status, since, loadTaskRuns]);

  // 筛选条件变化时重置到第 1 页
  useEffect(() => {
    setPage(1);
  }, [status, since]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const statusColors: Record<string, string> = {
    running: "bg-blue-50 text-blue-600",
    success: "bg-green-50 text-green-600",
    failed: "bg-red-50 text-red-600",
    timeout: "bg-amber-50 text-amber-600",
  };

  const statusLabels: Record<string, string> = {
    running: "执行中",
    success: "成功",
    failed: "失败",
    timeout: "超时",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
        <h2 className="text-lg font-semibold text-neutral-800">📋 任务日志</h2>
        <button
          onClick={() => { loadTaskRuns({ status: status || undefined, since: resolveTaskTimeRange(since), limit: pageSize, offset: (page - 1) * pageSize }); loadStats(); }}
          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          刷新
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* 统计分析面板 */}
        {stats && !loadingStats && stats.total > 0 && (
          <div className="mb-6">
            {/* 概览卡片 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <StatCard label="总执行" value={stats.total} color="text-neutral-800" />
              <StatCard label="成功" value={stats.success} color="text-emerald-600" />
              <StatCard label="失败" value={stats.failed} color="text-red-600" />
              <StatCard label="超时" value={stats.timeout} color="text-amber-600" />
              <StatCard
                label="成功率"
                value={stats.total > 0 ? `${((stats.success / stats.total) * 100).toFixed(1)}%` : "-"}
                color="text-blue-600"
              />
            </div>

            {/* 每个任务的统计 */}
            {stats.taskStats.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse mb-2">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-neutral-200">
                      <th className="pb-1.5 pr-3 font-medium">任务名称</th>
                      <th className="pb-1.5 pr-3 font-medium text-right">总次数</th>
                      <th className="pb-1.5 pr-3 font-medium text-right">成功</th>
                      <th className="pb-1.5 pr-3 font-medium text-right">失败</th>
                      <th className="pb-1.5 pr-3 font-medium text-right">成功率</th>
                      <th className="pb-1.5 font-medium text-right">平均耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.taskStats.map((ts) => (
                      <tr key={ts.taskId} className="border-b border-neutral-100">
                        <td className="py-1.5 pr-3 text-neutral-800 font-medium">{ts.taskName}</td>
                        <td className="py-1.5 pr-3 text-right text-neutral-600">{ts.total}</td>
                        <td className="py-1.5 pr-3 text-right text-emerald-600">{ts.success}</td>
                        <td className="py-1.5 pr-3 text-right text-red-600">{ts.failed}</td>
                        <td className="py-1.5 pr-3 text-right text-blue-600">
                          {ts.total > 0 ? `${((ts.success / ts.total) * 100).toFixed(1)}%` : "-"}
                        </td>
                        <td className="py-1.5 text-right text-neutral-600">
                          {ts.avgDuration > 0 ? formatDuration(ts.avgDuration) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 筛选器 */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-xs text-neutral-400">
            共 {taskRunsTotal} 条
          </span>
        </div>

        {/* 日志表格 */}
        {loadingTaskRuns ? (
          <p className="text-center text-neutral-400 py-8">加载中...</p>
        ) : taskRuns.length === 0 ? (
          <p className="text-center text-neutral-400 py-8">暂无执行记录</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-neutral-500 border-b-2 border-neutral-200">
                    <th className="pb-2 pr-4 font-semibold">任务名称</th>
                    <th className="pb-2 pr-3 font-semibold w-[70px]">状态</th>
                    <th className="pb-2 pr-3 font-semibold w-[170px]">开始时间</th>
                    <th className="pb-2 pr-3 font-semibold w-[80px]">耗时</th>
                    <th className="pb-2 font-semibold">输出/错误</th>
                  </tr>
                </thead>
                <tbody>
                  {taskRuns.map((run) => (
                    <tr key={run.id} className="border-b border-neutral-100 hover:bg-blue-50/40 group">
                      <td className="py-2 pr-4 text-neutral-800 font-medium">{run.taskName}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColors[run.status] || ""}`}>
                          {statusLabels[run.status] || run.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-neutral-500 whitespace-nowrap">
                        {new Date(run.startedAt).toLocaleString("zh-CN")}
                      </td>
                      <td className="py-2 pr-3 text-neutral-500">
                        {run.duration ? formatDuration(run.duration) : "-"}
                      </td>
                      <td className="py-2 text-neutral-400 text-xs max-w-xs truncate">
                        {run.error ? (
                          <span className="text-red-500">{run.error}</span>
                        ) : run.output ? (
                          <span>{run.output}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={taskRunsTotal} page={page} pageSize={pageSize} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-3">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
