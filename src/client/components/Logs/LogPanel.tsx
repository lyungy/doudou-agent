/**
 * 日志查看面板
 * 展示结构化日志 + LLM 请求记录，支持过滤和自动刷新
 */
import { useState, useEffect, useCallback } from "react";
import type { LogEntry } from "../../types";
import * as api from "../../lib/client";
import { LogFilters, resolveTimeRange, type LogFilterState } from "./LogFilters";
import { LLMRequestList } from "./LLMRequestList";

/** 标签页 */
type TabType = "logs" | "llm";

export function LogPanel() {
  const [tab, setTab] = useState<TabType>("logs");
  const [filter, setFilter] = useState<LogFilterState>({ level: "", module: "", since: "" });
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 加载日志
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const since = resolveTimeRange(filter.since);
      const result = await api.fetchLogs({
        level: filter.level || undefined,
        module: filter.module || undefined,
        since,
        limit: 200,
      });
      setEntries(result.entries);
      setTotal(result.total);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (tab !== "logs") return;
    loadLogs();
    if (autoRefresh) {
      const timer = setInterval(loadLogs, 10000);
      return () => clearInterval(timer);
    }
  }, [tab, autoRefresh, loadLogs]);

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
        <h2 className="text-lg font-semibold text-neutral-800">📋 系统日志</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            自动刷新
          </label>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="flex border-b border-neutral-200">
        <TabButton active={tab === "logs"} onClick={() => setTab("logs")}>
          日志列表
        </TabButton>
        <TabButton active={tab === "llm"} onClick={() => setTab("llm")}>
          LLM 请求
        </TabButton>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-6">
        {tab === "logs" ? (
          <>
            {/* 过滤器 */}
            <div className="mb-4">
              <LogFilters filter={filter} onChange={setFilter} />
            </div>

            {/* 日志统计 */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-neutral-400">
                共 {total} 条
                {loading && <span className="ml-2 text-blue-500">加载中...</span>}
              </span>
              <button
                onClick={loadLogs}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                刷新
              </button>
            </div>

            {/* 日志列表 */}
            {entries.length === 0 ? (
              <p className="text-sm text-neutral-400 py-8 text-center">暂无日志</p>
            ) : (
              <div className="space-y-1">
                {entries.map((entry, i) => (
                  <LogRow key={i} entry={entry} />
                ))}
              </div>
            )}
          </>
        ) : (
          <LLMRequestList />
        )}
      </div>
    </div>
  );
}

/** 日志行 */
function LogRow({ entry }: { entry: LogEntry }) {
  const levelColors: Record<string, string> = {
    debug: "bg-neutral-100 text-neutral-500",
    info: "bg-blue-50 text-blue-600",
    warn: "bg-amber-50 text-amber-600",
    error: "bg-red-50 text-red-600",
  };

  const moduleColors: Record<string, string> = {
    http: "bg-purple-50 text-purple-600",
    llm: "bg-cyan-50 text-cyan-600",
    agent: "bg-green-50 text-green-600",
    sse: "bg-orange-50 text-orange-600",
    system: "bg-neutral-100 text-neutral-600",
  };

  const time = new Date(entry.timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex items-start gap-2 py-1.5 px-3 rounded-lg hover:bg-neutral-50 text-sm font-mono group">
      {/* 时间 */}
      <span className="text-neutral-400 shrink-0 w-[72px]">{time}</span>

      {/* 级别 */}
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${levelColors[entry.level] || ""}`}>
        {entry.level.toUpperCase()}
      </span>

      {/* 模块 */}
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${moduleColors[entry.module] || "bg-neutral-100 text-neutral-500"}`}>
        {entry.module}
      </span>

      {/* 消息 */}
      <span className="text-neutral-700 break-all">{entry.message}</span>

      {/* meta（hover 展开） */}
      {entry.meta && (
        <span className="hidden group-hover:inline text-neutral-400 text-xs ml-2">
          {JSON.stringify(entry.meta)}
        </span>
      )}
    </div>
  );
}

/** 标签页按钮 */
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-500 text-blue-600"
          : "border-transparent text-neutral-500 hover:text-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}
