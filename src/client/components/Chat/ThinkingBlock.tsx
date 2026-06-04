/**
 * Thinking 块组件（可折叠）
 */
import { useState } from "react";

interface Props {
  content: string;
  isUser?: boolean;
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, isUser, isStreaming }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (!content) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-all ${
          isUser
            ? "bg-white/20 text-white/80 hover:bg-white/30"
            : "bg-purple-50 text-purple-600 hover:bg-purple-100"
        }`}
      >
        <span className="text-[11px]">🧠</span>
        <span>{isStreaming ? "思考中..." : "思考过程"}</span>
        <span className="text-[10px] opacity-60">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className={`mt-2 pl-3 border-l-2 ${
          isUser ? "border-white/30" : "border-purple-300"
        }`}>
          <div className={`text-xs whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed ${
            isUser ? "text-white/70" : "text-neutral-500"
          }`}>
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
