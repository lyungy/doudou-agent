/**
 * Thinking 块组件（可折叠）
 * 默认折叠，仅显示摘要信息；流式中自动展开
 */
import { useState, useEffect } from "react";

interface Props {
  content: string;
  isUser?: boolean;
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, isUser, isStreaming }: Props) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!isStreaming && content) {
      const timer = setTimeout(() => setExpanded(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  if (!content) return null;

  const charCount = content.length;
  const estimatedSecs = Math.max(1, Math.round(charCount / 80));

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full transition-all ${
          isUser
            ? "bg-white/20 text-white/80 hover:bg-white/30"
            : "bg-purple-50 text-purple-600 hover:bg-purple-100"
        }`}
      >
        <span className="text-[11px]">🧠</span>
        <span>{isStreaming ? "思考中..." : `思考过程 · ~${estimatedSecs}s`}</span>
        <span className="text-[10px] opacity-60">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className={`mt-2.5 pl-3.5 border-l-2 ${isUser ? "border-white/30" : "border-purple-300"}`}>
          <div className={`text-[13px] whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed ${
            isUser ? "text-white/70" : "text-neutral-500"
          }`}>
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
