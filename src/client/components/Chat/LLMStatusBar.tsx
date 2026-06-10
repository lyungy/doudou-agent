/**
 * LLM 状态指示器（增强版）
 * 显示：模型名 + provider + 连接状态 + TTFT + streaming 实时耗时 + token 用量
 * 状态 per-session，切换 session 自动切换显示
 */
import { useState, useEffect } from "react";
import { useAppStore } from "../../store";
import { formatDuration } from "../../lib/utils";

export function LLMStatusBar() {
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const llmStatusBySession = useAppStore((s) => s.llmStatusBySession);
  const currentModelId = useAppStore((s) => s.currentModelId);
  const models = useAppStore((s) => s.models);

  const status = currentSessionId ? llmStatusBySession[currentSessionId] : null;

  // 当前模型信息
  const currentModel = models.find((m) => m.id === currentModelId);
  const modelLabel = currentModel?.name || currentModelId || "未知模型";
  const providerLabel = currentModel?.providerName || "";

  if (!status) {
    // 无 LLM 状态时仍显示模型信息
    if (!currentModel) return null;
    return (
      <div className="flex items-center gap-3 px-6 py-2 text-xs border-t border-neutral-100 bg-neutral-50/50">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
          <span>就绪</span>
        </span>
        <span className="text-neutral-400">
          {providerLabel && <span className="text-neutral-300">{providerLabel} · </span>}
          {modelLabel}
        </span>
      </div>
    );
  }

  const { status: llmStatus, ttft: llmTtft, duration: llmDuration, inputTokens: llmInputTokens, outputTokens: llmOutputTokens, error: llmError } = status;

  return (
    <div className="flex items-center gap-3 px-6 py-2 text-xs border-t border-neutral-100 bg-neutral-50/50">
      {/* 状态标签 */}
      <StatusBadge status={llmStatus} />

      {/* 模型信息（始终显示） */}
      <span className="text-neutral-400">
        {providerLabel && <span className="text-neutral-300">{providerLabel} · </span>}
        {modelLabel}
      </span>

      {/* 连接中 */}
      {llmStatus === "connecting" && (
        <span className="text-neutral-500">正在连接...</span>
      )}

      {/* 推理中：实时耗时 */}
      {llmStatus === "streaming" && (
        <StreamingTimer ttft={llmTtft} />
      )}

      {/* 完成 */}
      {llmStatus === "completed" && (
        <div className="flex items-center gap-3 text-neutral-500">
          {llmTtft && <span>TTFT: {llmTtft}ms</span>}
          {llmDuration && <span>耗时: {formatDuration(llmDuration)}</span>}
          {llmInputTokens != null && (
            <span>
              {llmInputTokens.toLocaleString()} → {llmOutputTokens?.toLocaleString() || "?"} tokens
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

/** streaming 实时耗时计时器 */
function StreamingTimer({ ttft }: { ttft?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Date.now() - start);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const secs = (elapsed / 1000).toFixed(1);

  return (
    <div className="flex items-center gap-3 text-neutral-500">
      {ttft && <span>TTFT: {ttft}ms</span>}
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        {secs}s
      </span>
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
