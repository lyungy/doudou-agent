/**
 * 任务执行日志列表
 */
import { useEffect } from "react";
import { useAppStore } from "../../store";

export function TaskLogList() {
  const { taskRuns, loadingTaskRuns, loadTaskRuns } = useAppStore();

  useEffect(() => {
    loadTaskRuns();
  }, [loadTaskRuns]);

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
          onClick={() => loadTaskRuns()}
          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          刷新
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loadingTaskRuns ? (
          <p className="text-center text-neutral-400 py-8">加载中...</p>
        ) : taskRuns.length === 0 ? (
          <p className="text-center text-neutral-400 py-8">暂无执行记录</p>
        ) : (
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
                    {/* 任务名称 */}
                    <td className="py-2 pr-4 text-neutral-800 font-medium">{run.taskName}</td>

                    {/* 状态 */}
                    <td className="py-2 pr-3">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColors[run.status] || ""}`}>
                        {statusLabels[run.status] || run.status}
                      </span>
                    </td>

                    {/* 开始时间 */}
                    <td className="py-2 pr-3 text-neutral-500 whitespace-nowrap">
                      {new Date(run.startedAt).toLocaleString("zh-CN")}
                    </td>

                    {/* 耗时 */}
                    <td className="py-2 pr-3 text-neutral-500">
                      {run.duration ? `${(run.duration / 1000).toFixed(1)}s` : "-"}
                    </td>

                    {/* 输出/错误 */}
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
        )}
      </div>
    </div>
  );
}
