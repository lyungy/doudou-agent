/**
 * 工具调用卡片组件（增强版）
 * 增加：执行耗时实时计时
 */
import { useState, useEffect, useRef } from "react";
import type { ToolCallInfo } from "../../types";

interface Props {
  toolCall: ToolCallInfo;
}

export function ToolCallCard({ toolCall }: Props) {
  // 默认折叠；执行中自动展开，完成后折叠
  const [expanded, setExpanded] = useState(toolCall.status === "running");
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  // 状态从 running 变为 done/error 时自动折叠
  useEffect(() => {
    if (toolCall.status !== "running") {
      const timer = setTimeout(() => setExpanded(false), 300);
      return () => clearTimeout(timer);
    } else {
      setExpanded(true);
      startTimeRef.current = Date.now();
    }
  }, [toolCall.status]);

  // running 状态实时计时
  useEffect(() => {
    if (toolCall.status !== "running") return;
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 200);
    return () => clearInterval(timer);
  }, [toolCall.status]);

  const borderColor =
    toolCall.status === "running"
      ? "border-l-yellow-400"
      : toolCall.status === "error"
      ? "border-l-red-400"
      : "border-l-green-400";

  const statusDot =
    toolCall.status === "running"
      ? "bg-yellow-400 animate-pulse"
      : toolCall.status === "error"
      ? "bg-red-400"
      : "bg-green-400";

  const statusText =
    toolCall.status === "running"
      ? `执行中 ${formatElapsed(elapsed)}`
      : toolCall.status === "error"
      ? "失败"
      : "完成";

  const resultText =
    typeof toolCall.result?.content === "string"
      ? toolCall.result.content
      : Array.isArray(toolCall.result?.content)
      ? toolCall.result.content.map((c: any) => c.text || "").join("")
      : "";

  return (
    <div className={`bg-neutral-100/60 border border-neutral-200/60 rounded-xl text-xs overflow-hidden border-l-[3px] ${borderColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-100 transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
        <span className="font-mono text-neutral-700 font-medium">{toolCall.name}</span>
        <span className={`text-[11px] ${toolCall.status === "running" ? "text-yellow-600" : toolCall.status === "error" ? "text-red-500" : "text-neutral-400"}`}>
          {statusText}
        </span>
        <span className="ml-auto text-neutral-300 text-[10px]">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 px-3 py-2.5 bg-white">
          {Object.keys(toolCall.args).length > 0 && (
            <div className="mb-2">
              <div className="text-neutral-400 mb-1 text-[11px] uppercase tracking-wider">参数</div>
              <pre className="bg-neutral-50 p-2 rounded-md text-[11px] overflow-x-auto text-neutral-600 font-mono">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}

          {resultText && (
            <div>
              <div className="text-neutral-400 mb-1 text-[11px] uppercase tracking-wider">结果</div>
              <pre className="bg-neutral-50 p-2 rounded-md text-[11px] overflow-x-auto max-h-36 overflow-y-auto text-neutral-600 font-mono">
                {resultText.slice(0, 2000)}
                {resultText.length > 2000 && "\n... [已截断]"}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 格式化耗时 */
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
