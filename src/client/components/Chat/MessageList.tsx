/**
 * 消息列表组件（智能滚动 + 回到底部按钮）
 *
 * 核心设计：
 * - 用 scrollTop 变化方向区分「用户上拉」和「内容增长」
 *   只有 scrollTop 减小才算用户操作；内容增长时 scrollTop 不变
 * - 用 scrollTo 替代 scrollIntoView，避免 reflow 时序竞争
 * - userScrolled 一旦为 true，只有「回到底部」按钮或新消息能重置
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { useChat } from "../../hooks/useChat";
import { useAppStore } from "../../store";

/** 距离底部多少 px 以内算「在底部」 */
const BOTTOM_THRESHOLD = 100;

export function MessageList() {
  const { messages, isStreaming, regenerate } = useChat();
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // 用户是否主动上拉（一旦为 true，只有按钮点击或新消息能重置）
  const userScrolledRef = useRef(false);
  // 上一次 scrollTop（用于判断滚动方向）
  const prevScrollTopRef = useRef(0);
  // 上一次消息数量（用于检测新消息到达）
  const prevCountRef = useRef(0);

  /** 计算是否在底部附近 */
  const checkNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  /** 滚动到底部（用 scrollTo 替代 scrollIntoView，避免 reflow 竞争） */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight - el.clientHeight,
      behavior,
    });
    userScrolledRef.current = false;
    setShowScrollBtn(false);
  }, []);

  /** 监听滚动：用 scrollTop 方向判断用户意图 */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // 初始化 scrollTop
    prevScrollTopRef.current = el.scrollTop;

    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;

        const currentTop = el.scrollTop;
        const diff = prevScrollTopRef.current - currentTop; // > 0 表示往上滚
        prevScrollTopRef.current = currentTop;

        // 只有 scrollTop 真正减小才算用户上拉
        // 内容增长时 scrollTop 不变（diff ≈ 0），不会误触发
        if (diff > 2 && !userScrolledRef.current) {
          userScrolledRef.current = true;
          setShowScrollBtn(true);
        }

        // 用户手动滚回底部 → 重置（允许自动跟随恢复）
        if (userScrolledRef.current && checkNearBottom()) {
          userScrolledRef.current = false;
          setShowScrollBtn(false);
        }
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [checkNearBottom]);

  /** 自动滚动逻辑 */
  useEffect(() => {
    const newMsgCount = messages.length;
    const isNewMessage = newMsgCount > prevCountRef.current;
    prevCountRef.current = newMsgCount;

    // 新消息到达：重置状态，跟到底部
    if (isNewMessage) {
      userScrolledRef.current = false;
      setShowScrollBtn(false);
      const el = containerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight - el.clientHeight, behavior: "instant" });
      }
      return;
    }

    // 流式输出中 + 用户未上拉 → 自动滚动
    if (isStreaming && !userScrolledRef.current) {
      const el = containerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight - el.clientHeight, behavior: "instant" });
      }
    }
  }, [messages, isStreaming]);

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
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto relative"
      style={{ overflowAnchor: "auto" }}
    >
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
        <div className="absolute bottom-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <button
            onClick={() => scrollToBottom()}
            className="pointer-events-auto
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
        </div>
      )}
    </div>
  );
}
