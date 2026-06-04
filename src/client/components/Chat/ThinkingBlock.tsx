/**
 * Thinking 块组件（可折叠 + 流式自动展开）
 *
 * 优化：流式时默认折叠（减少 reflow 次数），完成时自动展开
 * 用户可随时手动切换
 */
import { useState, useEffect, useRef } from "react";

interface Props {
  content: string;
  isUser?: boolean;
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, isUser, isStreaming }: Props) {
  // 流式时折叠（减少高频 reflow），完成后展开
  const [expanded, setExpanded] = useState(false);
  const wasStreamingRef = useRef(false);

  // 流式开始时折叠，流式结束时展开
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      setExpanded(false);
    } else if (wasStreamingRef.current) {
      // 流式刚结束，自动展开
      wasStreamingRef.current = false;
      setExpanded(true);
    }
  }, [isStreaming]);

  if (!content) return null;

  return (
    <div className={`mb-2 ${isUser ? "" : ""}`}>
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
