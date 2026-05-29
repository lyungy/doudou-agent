/**
 * LLM 状态指示器
 * 显示当前 LLM 请求的状态：连接中 → 推理中 → 完成/错误
 * 状态 per-session，切换 session 自动切换显示
 */
import { useAppStore } from "../../store";

export function LLMStatusBar() {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const llmStatusBySession = useAppStore((s) => s.llmStatusBySession);

  const status = currentSessionId ? llmStatusBySession[currentSessionId] : null;
  if (!status) return null;

  const { status: llmStatus, ttft: llmTtft, duration: llmDuration, inputTokens: llmInputTokens, outputTokens: llmOutputTokens, error: llmError } = status;

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 text-xs border-t border-neutral-100 bg-neutral-50">
      {/* 状态标签 */}
      <StatusBadge status={llmStatus} />

      {/* 连接中 */}
      {llmStatus === "connecting" && (
        <span className="text-neutral-500">正在连接 LLM...</span>
      )}

      {/* 推理中 */}
      {llmStatus === "streaming" && llmTtft && (
        <span className="text-neutral-500">
          首 token: {llmTtft}ms
        </span>
      )}

      {/* 完成 */}
      {llmStatus === "completed" && (
        <div className="flex items-center gap-3 text-neutral-500">
          {llmTtft && <span>TTFT: {llmTtft}ms</span>}
          {llmDuration && <span>总耗时: {formatDuration(llmDuration)}</span>}
          {llmInputTokens != null && (
            <span>
              Tokens: {llmInputTokens.toLocaleString()} → {llmOutputTokens?.toLocaleString() || "?"}
            </span>
          )}
        </div>
      )}

      {/* 错误 */}
      {llmStatus === "error" && (
        <span className="text-red-500 truncate max-w-md" title={llmError || ""}>
          {llmError || "未知错误"}
        </span>
      )}

      {/* 中止 */}
      {llmStatus === "aborted" && (
        <span className="text-amber-500">已中止</span>
      )}
    </div>
  );
}

/** 状态徽章 */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: string; label: string }> = {
    connecting: { color: "bg-blue-100 text-blue-700", icon: "⏳", label: "连接中" },
    streaming: { color: "bg-green-100 text-green-700", icon: "⚡", label: "推理中" },
    completed: { color: "bg-emerald-100 text-emerald-700", icon: "✅", label: "完成" },
    error: { color: "bg-red-100 text-red-700", icon: "❌", label: "错误" },
    aborted: { color: "bg-amber-100 text-amber-700", icon: "⏹", label: "已中止" },
  };

  const c = config[status] || config.connecting;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${c.color}`}>
      <span>{c.icon}</span>
      <span>{c.label}</span>
    </span>
  );
}

/** 格式化耗时 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
