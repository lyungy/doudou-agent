/**
 * 任务执行状态卡片
 */
import { useEffect, useState } from "react";
import type { Task, TaskRun } from "../../types";
import { fetchTasks, fetchTaskRuns } from "../../lib/client";

interface Props {
  /** 可选：从外部传入数据，不传则自行加载 */
  tasks?: Task[];
  taskRuns?: TaskRun[];
}

export function TaskStatusCard({ tasks: tasksProp, taskRuns: runsProp }: Props) {
  const [tasks, setTasks] = useState<Task[]>(tasksProp ?? []);
  const [runs, setRuns] = useState<TaskRun[]>(runsProp ?? []);
  const [loading, setLoading] = useState(!tasksProp);

  useEffect(() => {
    if (tasksProp && runsProp) return; // 外部传入，不重复加载
    (async () => {
      setLoading(true);
      try {
        const [t, r] = await Promise.all([fetchTasks(), fetchTaskRuns()]);
        setTasks(t);
        setRuns(r);
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, [tasksProp, runsProp]);

  const totalTasks = tasks.length;
  const enabledTasks = tasks.filter((t) => t.enabled).length;
  const totalRuns = runs.length;
  const successRuns = runs.filter((r) => r.status === "success").length;
  const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0;

  // 最近一次执行
  const lastRun = runs.length > 0 ? runs[0] : null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-700 mb-4">✅ 任务执行状态</h3>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-neutral-50 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 任务概览 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xl font-bold text-neutral-800">{totalTasks}</div>
              <div className="text-xs text-neutral-500">总任务</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-green-600">{enabledTasks}</div>
              <div className="text-xs text-neutral-500">已启用</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-600">{successRate}%</div>
              <div className="text-xs text-neutral-500">成功率</div>
            </div>
          </div>

          {/* 最近执行 */}
          {lastRun && (
            <div className="border-t border-neutral-100 pt-3">
              <div className="text-xs text-neutral-500 mb-2">最近执行</div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-700 truncate max-w-[60%]">
                  {lastRun.taskName}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      lastRun.status === "success"
                        ? "bg-green-500"
                        : lastRun.status === "running"
                        ? "bg-blue-500 animate-pulse"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-xs text-neutral-500">
                    {lastRun.duration
                      ? `${(lastRun.duration / 1000).toFixed(1)}s`
                      : "进行中"}
                  </span>
                </div>
              </div>
              <div className="text-xs text-neutral-400 mt-1">
                {new Date(lastRun.startedAt).toLocaleString("zh-CN")}
              </div>
            </div>
          )}

          {totalTasks === 0 && (
            <div className="text-center text-sm text-neutral-400 py-2">
              暂无定时任务
            </div>
          )}
        </div>
      )}
    </div>
  );
}
