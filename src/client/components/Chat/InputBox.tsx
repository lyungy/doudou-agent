/**
 * 输入框组件（现代卡片式设计）
 */
import { useState, useRef, useEffect } from "react";
import { useChat } from "../../hooks/useChat";

export function InputBox() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { send, abort, isStreaming } = useChat();

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    send(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden transition-shadow hover:shadow-xl focus-within:shadow-xl focus-within:border-blue-300">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
            className="w-full resize-none px-4 py-3.5 text-[14px] text-neutral-800 placeholder-neutral-400 focus:outline-none bg-transparent leading-relaxed"
            rows={1}
            disabled={isStreaming}
          />
          {/* 底栏 */}
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="text-[11px] text-neutral-300 select-none">
              Enter 发送
            </span>
            {isStreaming ? (
              <button
                onClick={abort}
                className="w-8 h-8 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition-all active:scale-90"
                title="停止"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-200 text-white disabled:text-neutral-400 rounded-full transition-all active:scale-90 disabled:cursor-not-allowed"
                title="发送"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
