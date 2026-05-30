/**
 * 模型使用分布饼图
 */
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import type { ModelStats } from "../../lib/client";

interface Props {
  data: ModelStats | null;
  loading: boolean;
}

const COLORS = [
  "#3b82f6", // 蓝
  "#22c55e", // 绿
  "#a855f7", // 紫
  "#f59e0b", // 橙
  "#ef4444", // 红
  "#06b6d4", // 青
  "#ec4899", // 粉
  "#8b5cf6", // 靛
  "#14b8a6", // 碧
  "#f97316", // 深橙
];

export function ModelPieChart({ data, loading }: Props) {
  const chartData =
    data?.models.map((m) => ({
      name: m.modelId,
      value: m.count,
    })) ?? [];

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-700 mb-4">🧠 模型使用分布</h3>
      {loading ? (
        <div className="h-64 bg-neutral-50 rounded animate-pulse" />
      ) : chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">暂无数据</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }: any) =>
                `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={{ strokeWidth: 1 }}
            >
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any) => [`${value} 次`, "调用次数"]}
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e5", fontSize: 13 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) => (
                <span className="text-neutral-600">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      {!loading && total > 0 && (
        <div className="text-center text-xs text-neutral-400 mt-1">
          共 {total} 次调用
        </div>
      )}
    </div>
  );
}
