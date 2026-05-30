/**
 * LLM 耗时趋势图
 */
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { PerformanceStats } from "../../lib/client";

interface Props {
  data: PerformanceStats | null;
  loading: boolean;
}

/** 毫秒转可读格式 */
function formatMs(ms: number): string {
  if (ms >= 60000) return (ms / 60000).toFixed(1) + "min";
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return ms + "ms";
}

export function PerformanceChart({ data, loading }: Props) {
  const chartData =
    data?.days
      .filter((d) => d.requestCount > 0)
      .map((d) => ({
        ...d,
        date: d.date.slice(5),
      })) ?? [];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-700 mb-4">⏱️ LLM 响应耗时</h3>
      {loading ? (
        <div className="h-64 bg-neutral-50 rounded animate-pulse" />
      ) : chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">暂无数据</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#999" />
            <YAxis tick={{ fontSize: 12 }} stroke="#999" tickFormatter={(v) => formatMs(v)} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e5", fontSize: 13 }}
              formatter={(value: any, name: any) => [formatMs(Number(value)), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="avgTTFT"
              name="平均 TTFT"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="p95TTFT"
              name="P95 TTFT"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 3 }}
              strokeDasharray="5 5"
            />
            <Line
              type="monotone"
              dataKey="avgDuration"
              name="平均总耗时"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
