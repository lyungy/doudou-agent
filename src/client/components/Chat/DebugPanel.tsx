/**
 * DebugPanel — Debug 模式面板
 * 右侧抽屉，展示 Agent 执行链路的 debug 事件
 */
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../store";
import type { DebugEntry, DebugEntryType } from "../../types";

/** 事件类型 → 图标 + 颜色 */
const EVENT_STYLE: Record<DebugEntryType, { icon: string; color: string; bg: string }> = {
  system_prompt: { icon: "📝", color: "text-purple-600", bg: "bg-purple-50" },
  payload:       { icon: "📤", color: "text-blue-600", bg: "bg-blue-50" },
  response:      { icon: "📥", color: "text-green-600", bg: "bg-green-50" },
  messages:      { icon: "📨", color: "text-amber-600", bg: "bg-amber-50" },
  tool_input:    { icon: "🔧", color: "text-cyan-600", bg: "bg-cyan-50" },
  tool_output:   { icon: "✅", color: "text-emerald-600", bg: "bg-emerald-50" },
};

function DebugEntryCard({ entry }: { entry: DebugEntry }) {
  const [expanded, setExpanded] = useState(false);
  const style = EVENT_STYLE[entry.type] || { icon: "❓", color: "text-neutral-600", bg: "bg-neutral-50" };

  const summary = getSummary(entry);

  return (
    <div className={`rounded-xl border border-neutral-200/60 ${style.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] transition-colors"
      >
        <span className="text-sm">{style.icon}</span>
        <span className={`text-xs font-medium ${style.color}`}>{entry.type}</span>
        <span className="text-xs text-neutral-400 flex-1 truncate">{summary}</span>
        <span className="text-[10px] text-neutral-300">{formatTime(entry.timestamp)}</span>
        <span className={`text-xs text-neutral-400 transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <pre className="text-[11px] leading-relaxed text-neutral-600 bg-white rounded-lg p-2.5 overflow-x-auto max-h-80 overflow-y-auto border border-neutral-100">
            {JSON.stringify(entry.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function getSummary(entry: DebugEntry): string {
  const d = entry.data;
  switch (entry.type) {
    case "system_prompt":
      return `${d.length || 0} 字符`;
    case "payload":
      return `model=${d.model || "?"} · ${d.messageCount || 0} msgs · ${d.toolCount || 0} tools`;
    case "response":
      return `status=${d.status || "?"}`;
    case "messages":
      return `${d.inputCount || 0} → ${d.outputCount || 0} 条`;
    case "tool_input":
      return `${d.toolName || "?"}`;
    case "tool_output":
      return `${d.toolName || "?"} ${d.isError ? "⚠️ error" : "✓"}`;
    default:
      return JSON.stringify(d).slice(0, 60);
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

export function DebugPanel() {
  const { debugPanelOpen, debugEntries, toggleDebugPanel, clearDebugEntries } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // 新条目自动滚到底部
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [debugEntries.length, autoScroll]);

  if (!debugPanelOpen) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[420px] shrink-0 bg-white border-l border-neutral-200 shadow-xl flex flex-col z-40">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50/80">
        <div className="flex items-center gap-2">
          <span className="text-sm">🐛</span>
          <span className="text-sm font-semibold text-neutral-700">Debug Panel</span>
          <span className="text-[11px] text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded-md">
            {debugEntries.length} events
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={clearDebugEntries}
            className="px-2 py-1 text-[11px] text-neutral-500 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
          >
            清空
          </button>
          <button
            onClick={toggleDebugPanel}
            className="px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 条目列表 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
        onScroll={() => {
          const el = scrollRef.current;
          if (el) {
            setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 50);
          }
        }}
      >
        {debugEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400">
            <span className="text-2xl mb-2">🔍</span>
            <span className="text-xs">等待 Debug 事件...</span>
            <span className="text-[11px] mt-1">发送消息后将显示 Agent 执行链路</span>
          </div>
        ) : (
          debugEntries.map((entry) => <DebugEntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
