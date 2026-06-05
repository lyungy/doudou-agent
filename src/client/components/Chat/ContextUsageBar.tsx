/**
 * 上下文用量进度条
 * 显示当前会话的 token 使用占比（累计 inputTokens / 模型 contextWindow）
 */
import { useEffect, useMemo } from "react";
import { useAppStore } from "../../store";

/** 获取用量等级颜色 */
function getUsageColor(percentage: number): { bar: string; text: string } {
  if (percentage >= 85) return { bar: "bg-red-500", text: "text-red-600" };
  if (percentage >= 60) return { bar: "bg-amber-500", text: "text-amber-600" };
  return { bar: "bg-emerald-500", text: "text-emerald-600" };
}

export function ContextUsageBar() {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const cumulativeTokensBySession = useAppStore((s) => s.cumulativeTokensBySession);
  const currentModelId = useAppStore((s) => s.currentModelId);
  const models = useAppStore((s) => s.models);
  const refreshCumulativeTokens = useAppStore((s) => s.refreshCumulativeTokens);

  // 获取当前模型的 contextWindow
  const contextWindow = useMemo(() => {
    if (!currentModelId || !models.length) return 128000;
    const model = models.find((m) => m.id === currentModelId);
    return model?.contextWindow || 128000;
  }, [currentModelId, models]);

  // 获取当前 session 的累计 token
  const tokens = currentSessionId ? cumulativeTokensBySession[currentSessionId] : null;

  // 切换 session 时加载数据
  useEffect(() => {
    if (currentSessionId && !tokens) {
      refreshCumulativeTokens(currentSessionId);
    }
  }, [currentSessionId]);

  // 无数据时不显示
  if (!tokens || tokens.requestCount === 0) return null;

  const inputTokens = tokens.inputTokens;
  const percentage = Math.min((inputTokens / contextWindow) * 100, 100);
  const colors = getUsageColor(percentage);

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs border-b border-neutral-100 bg-neutral-50/80">
      <span className="text-neutral-500 shrink-0">上下文</span>

      {/* 进度条 */}
      <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden max-w-[200px]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colors.bar}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* 百分比 + token 数 */}
      <span className={`font-medium ${colors.text}`}>
        {percentage.toFixed(1)}%
      </span>
      <span className="text-neutral-400">
        {inputTokens.toLocaleString()} / {contextWindow.toLocaleString()}
      </span>
      <span className="text-neutral-400">tokens</span>
    </div>
  );
}
