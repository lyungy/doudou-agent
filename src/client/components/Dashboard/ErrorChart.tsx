/**
 * 错误统计柱状图
 */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ErrorStats } from "../../lib/client";

interface Props {
  data: ErrorStats | null;
  loading: boolean;
}

export function ErrorChart({ data, loading }: Props) {
  const chartData =
    data?.days.map((d) => ({
      ...d,
      date: d.date.slice(5),
      total: d.llmErrors + d.taskFailures,
    })) ?? [];

  const hasData = chartData.some((d) => d.total > 0);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-700 mb-4">❌ 错误统计</h3>

      {/* 汇总数字 */}
      {!loading && data && (
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-red-400" />
            <span className="text-xs text-neutral-500">
              LLM 错误：<strong className="text-neutral-700">{data.totalLLMErrors}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-orange-400" />
            <span className="text-xs text-neutral-500">
              任务失败：<strong className="text-neutral-700">{data.totalTaskFailures}</strong>
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-48 bg-neutral-50 rounded animate-pulse" />
      ) : !hasData ? (
        <div className="h-48 flex items-center justify-center text-neutral-400 text-sm">
          🎉 近期无错误
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#999" />
            <YAxis tick={{ fontSize: 12 }} stroke="#999" allowDecimals={false} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e5", fontSize: 13 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="llmErrors"
              name="LLM 错误"
              fill="#f87171"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="taskFailures"
              name="任务失败"
              fill="#fb923c"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
