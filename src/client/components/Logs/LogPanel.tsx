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
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono border-collapse">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b-2 border-neutral-200">
                      <th className="pb-2 pr-4 font-semibold w-[190px]">时间</th>
                      <th className="pb-2 pr-3 font-semibold w-[60px]">级别</th>
                      <th className="pb-2 pr-3 font-semibold w-[70px]">模块</th>
                      <th className="pb-2 pr-3 font-semibold">消息</th>
                      <th className="pb-2 font-semibold w-[200px]">详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, i) => (
                      <LogRow key={i} entry={entry} />
                    ))}
                  </tbody>
                </table>
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

/** 日志行（表格行） */
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

  // 完整时间格式：2026-05-28 23:27:05.123
  const dt = new Date(entry.timestamp);
  const date = dt.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = dt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const ms = String(dt.getMilliseconds()).padStart(3, "0");

  return (
    <tr className="border-b border-neutral-100 hover:bg-blue-50/40 group">
      {/* 时间 — 最前、最醒目 */}
      <td className="py-1.5 pr-4 text-neutral-500 whitespace-nowrap">
        <span className="text-neutral-700 font-medium">{date} {time}</span>
        <span className="text-neutral-400">.{ms}</span>
      </td>

      {/* 级别 */}
      <td className="py-1.5 pr-3">
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${levelColors[entry.level] || ""}`}>
          {entry.level.toUpperCase()}
        </span>
      </td>

      {/* 模块 */}
      <td className="py-1.5 pr-3">
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${moduleColors[entry.module] || "bg-neutral-100 text-neutral-500"}`}>
          {entry.module}
        </span>
      </td>

      {/* 消息 */}
      <td className="py-1.5 pr-3 text-neutral-700">{entry.message}</td>

      {/* 详情（hover 显示） */}
      <td className="py-1.5 text-neutral-400 text-xs">
        {entry.meta ? (
          <span className="hidden group-hover:inline break-all">{JSON.stringify(entry.meta)}</span>
        ) : null}
      </td>
    </tr>
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
