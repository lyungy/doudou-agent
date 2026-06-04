/**
 * 消息列表组件（智能滚动 + 回到底部按钮）
 *
 * 行为：
 * - 流式输出时自动滚动到底部
 * - 用户上拉查看历史时，停止自动滚动
 * - 显示浮动「回到底部」按钮，点击跳回最新消息
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { useChat } from "../../hooks/useChat";
import { useAppStore } from "../../store";

/** 距离底部多少 px 以内算「在底部」 */
const BOTTOM_THRESHOLD = 80;

export function MessageList() {
  const { messages, isStreaming, regenerate } = useChat();
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);  // 用 ref 避免闭包陈旧值
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const userScrolledRef = useRef(false);  // 用户是否主动滚动过

  /** 检测是否在底部附近 */
  const checkNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceToBottom < BOTTOM_THRESHOLD;
    isNearBottomRef.current = near;
    setShowScrollBtn(!near && messages.length > 0);
    return near;
  }, [messages.length]);

  /** 滚动到底部 */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior });
    isNearBottomRef.current = true;
    userScrolledRef.current = false;
    setShowScrollBtn(false);
  }, []);

  /** 监听用户手动滚动 */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      // 用户手动滚动时标记
      if (!isNearBottomRef.current) {
        userScrolledRef.current = true;
      }
      checkNearBottom();
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [checkNearBottom]);

  /** 消息变化时：在底部才自动滚动 */
  useEffect(() => {
    if (isNearBottomRef.current) {
      // 用 instant 行为避免流式输出时 smooth 动画堆积
      endRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [messages]);

  /** 流式开始时：如果用户没手动滚动过，强制滚到底部 */
  useEffect(() => {
    if (isStreaming && !userScrolledRef.current) {
      scrollToBottom("instant");
    }
  }, [isStreaming, scrollToBottom]);

  // 空状态：欢迎页
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-lg shadow-blue-500/25">
            <span className="text-4xl">🐕</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">Doudou Agent</h1>
          <p className="text-neutral-400 text-sm leading-relaxed">
            有什么我可以帮你的？
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {["帮我写一段代码", "解释一下量子计算", "翻译这段文字"].map((hint) => (
              <button
                key={hint}
                onClick={() => useAppStore.getState().sendMessage(hint)}
                className="px-3 py-1.5 bg-neutral-100 text-neutral-500 text-xs rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer"
              >
                {hint}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 找到最后一条 assistant 消息的 id
  const lastAssistantId = [...messages].reverse().find((m) => m.type === "assistant")?.id;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {messages.map((msg) => {
          const isLastAssistant = msg.type === "assistant" && msg.id === lastAssistantId;
          const isStreamingThis = isLastAssistant && isStreaming;

          return (
            <div key={msg.id} className="group">
              <MessageBubble
                message={msg}
                isStreaming={isStreamingThis}
                canRegenerate={isLastAssistant && !isStreaming}
                onRegenerate={regenerate}
              />
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* 浮动「回到底部」按钮 */}
      {showScrollBtn && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10
            flex items-center gap-1.5 px-4 py-2 rounded-full
            bg-white/90 backdrop-blur-sm border border-neutral-200 shadow-lg
            text-sm text-neutral-600 hover:text-neutral-800 hover:shadow-xl
            transition-all duration-200 active:scale-95"
          title="回到底部查看最新消息"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
          <span>回到底部</span>
          {isStreaming && (
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
          )}
        </button>
      )}
    </div>
  );
}
