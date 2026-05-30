/**
 * 概览数字卡片（第一行）
 */
import type { StatsOverview as StatsOverviewType } from "../../lib/client";

interface Props {
  data: StatsOverviewType | null;
  loading: boolean;
}

/** 格式化大数字 */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

const cards = [
  { key: "totalSessions" as const, label: "对话总数", icon: "🗣️", color: "bg-blue-50 text-blue-700" },
  { key: "totalMessages" as const, label: "消息总数", icon: "💬", color: "bg-green-50 text-green-700" },
  { key: "totalLLMRequests" as const, label: "LLM 调用", icon: "🤖", color: "bg-purple-50 text-purple-700" },
  { key: "totalTokens" as const, label: "Token 消耗", icon: "📝", color: "bg-amber-50 text-amber-700" },
];

export function StatsOverviewCard({ data, loading }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{card.icon}</span>
            <span className="text-sm text-neutral-500 font-medium">{card.label}</span>
          </div>
          <div className="text-2xl font-bold text-neutral-800">
            {loading ? (
              <div className="h-8 w-20 bg-neutral-100 rounded animate-pulse" />
            ) : (
              formatNumber(data?.[card.key] ?? 0)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
