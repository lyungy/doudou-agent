/**
 * 每日趋势折线图
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
import type { DailyStats } from "../../lib/client";

interface Props {
  data: DailyStats | null;
  loading: boolean;
}

export function DailyChart({ data, loading }: Props) {
  const chartData =
    data?.days.map((d) => ({
      ...d,
      date: d.date.slice(5), // MM-DD
    })) ?? [];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-700 mb-4">📈 每日趋势</h3>
      {loading ? (
        <div className="h-64 bg-neutral-50 rounded animate-pulse" />
      ) : chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">暂无数据</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#999" />
            <YAxis tick={{ fontSize: 12 }} stroke="#999" />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e5", fontSize: 13 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="sessions"
              name="新建对话"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="messages"
              name="消息数"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="llmRequests"
              name="LLM 调用"
              stroke="#a855f7"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
