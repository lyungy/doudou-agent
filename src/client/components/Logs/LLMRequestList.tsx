/**
 * LLM 请求列表组件
 * 展示 LLM 请求记录：状态、耗时、token 用量
 */
import { useState, useEffect, useCallback } from "react";
import type { LLMRequestRecord } from "../../types";
import * as api from "../../lib/client";

interface Props {
  sessionId?: string;
}

export function LLMRequestList({ sessionId }: Props) {
  const [requests, setRequests] = useState<LLMRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.fetchLLMRequests(sessionId, 50);
      setRequests(result.requests);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000); // 10 秒刷新
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-700">LLM 请求记录</h3>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {loading ? "刷新中..." : "刷新"}
        </button>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-neutral-400 py-8 text-center">暂无 LLM 请求记录</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-200">
                <th className="pb-2 pr-3 font-medium">状态</th>
                <th className="pb-2 pr-3 font-medium">模型</th>
                <th className="pb-2 pr-3 font-medium">TTFT</th>
                <th className="pb-2 pr-3 font-medium">总耗时</th>
                <th className="pb-2 pr-3 font-medium">Input Tokens</th>
                <th className="pb-2 pr-3 font-medium">Output Tokens</th>
                <th className="pb-2 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 pr-3">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="py-2 pr-3 text-neutral-700 font-mono text-xs">
                    {req.modelId}
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">
                    {req.ttft != null ? `${req.ttft}ms` : "-"}
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">
                    {req.duration != null ? formatDuration(req.duration) : "-"}
                  </td>
                  <td className="py-2 pr-3 text-neutral-600 font-mono">
                    {req.inputTokens?.toLocaleString() ?? "-"}
                  </td>
                  <td className="py-2 pr-3 text-neutral-600 font-mono">
                    {req.outputTokens?.toLocaleString() ?? "-"}
                  </td>
                  <td className="py-2 text-neutral-400 text-xs">
                    {formatTime(req.startTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    connecting: { color: "bg-blue-100 text-blue-700", label: "连接中" },
    streaming: { color: "bg-green-100 text-green-700", label: "推理中" },
    completed: { color: "bg-emerald-100 text-emerald-700", label: "完成" },
    error: { color: "bg-red-100 text-red-700", label: "错误" },
    aborted: { color: "bg-amber-100 text-amber-700", label: "中止" },
  };
  const c = config[status] || config.connecting;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date} ${time}`;
}
