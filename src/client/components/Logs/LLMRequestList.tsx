/**
 * LLM 请求列表组件
 * 支持筛选（状态、模型、时间范围）+ 分页
 */
import { useState, useEffect, useCallback } from "react";
import type { LLMRequestRecord } from "../../types";
import * as api from "../../lib/client";
import { Pagination } from "../common/Pagination";
import { LLM_STATUS_COLORS, LLM_STATUS_LABELS, formatDuration, formatTime, resolveTimeRange } from "../../lib/utils";

interface Props {
  sessionId?: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "connecting", label: "连接中" },
  { value: "streaming", label: "推理中" },
  { value: "completed", label: "完成" },
  { value: "error", label: "错误" },
  { value: "aborted", label: "中止" },
];

const TIME_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部时间" },
  { value: "5m", label: "最近 5 分钟" },
  { value: "15m", label: "最近 15 分钟" },
  { value: "1h", label: "最近 1 小时" },
  { value: "24h", label: "最近 24 小时" },
];

export function LLMRequestList({ sessionId }: Props) {
  const [requests, setRequests] = useState<LLMRequestRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  // 筛选条件
  const [status, setStatus] = useState("");
  const [modelId, setModelId] = useState("");
  const [since, setSince] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  // 加载模型列表（供筛选下拉用）
  useEffect(() => {
    api.fetchLLMRequestModels().then(({ models }) => setModelOptions(models)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.fetchLLMRequests({
        sessionId,
        status: status || undefined,
        modelId: modelId || undefined,
        since: resolveTimeRange(since),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setRequests(result.requests);
      setTotal(result.total);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [sessionId, status, modelId, since, page]);

  // 筛选条件变化时重置到第 1 页
  useEffect(() => {
    setPage(1);
  }, [status, modelId, since]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div>
      {/* 标题 + 筛选器 */}
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

      {/* 筛选器 */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">全部模型</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {TIME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 统计 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-neutral-400">
          共 {total} 条
          {loading && <span className="ml-2 text-blue-500">加载中...</span>}
        </span>
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
                <th className="pb-2 pr-3 font-medium">Session</th>
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
                  <td className="py-2 pr-3 text-neutral-500 font-mono text-xs max-w-[100px] truncate">
                    {req.sessionId}
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
          <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = LLM_STATUS_COLORS[status] || LLM_STATUS_COLORS.connecting;
  const label = LLM_STATUS_LABELS[status] || status;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
