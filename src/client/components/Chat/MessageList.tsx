/**
 * 消息列表组件（智能滚动 + 回到底部按钮）
 *
 * 两个核心机制配合：
 * 1. 限流：auto-scroll 最多 200ms 执行一次，避免连续覆盖用户手势
 * 2. debounce：程序滚动后 150ms 内忽略 scroll 事件
 *
 * 用户手势检测窗口 = 200ms 限流间隔 - 150ms debounce = 50ms
 * 但这 50ms 内用户手势可以被检测到 → 设 userScrolled → 停止自动跟随
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { useChat } from "../../hooks/useChat";
import { useAppStore } from "../../store";

const BOTTOM_THRESHOLD = 100;
const DEBOUNCE_MS = 150;
const AUTO_SCROLL_THROTTLE_MS = 200;

export function MessageList() {
  const { messages, isStreaming, regenerate } = useChat();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const userScrolledRef = useRef(false);
  const autoScrollAtRef = useRef(0);
  const lastAutoScrollAtRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const prevCountRef = useRef(0);

  /** 检测是否在底部附近 */
  const checkNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  /** 按钮点击：平滑滚动 */
  const handleScrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    userScrolledRef.current = false;
    setShowScrollBtn(false);
    // 长 debounce 覆盖 smooth 动画期间的中间事件
    autoScrollAtRef.current = Date.now() + 500;
    el.scrollTo({ top: el.scrollHeight - el.clientHeight, behavior: "smooth" });
  }, []);

  /** 监听滚动：debounce → 方向检测 */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    prevScrollTopRef.current = el.scrollTop;
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;

        // 程序滚动后的 debounce 窗口内，忽略（这是 scrollTo 触发的事件）
        if (Date.now() - autoScrollAtRef.current < DEBOUNCE_MS) return;

        // 超出 debounce 窗口 = 用户手动操作
        const currentTop = el.scrollTop;
        const diff = prevScrollTopRef.current - currentTop;
        prevScrollTopRef.current = currentTop;

        // 用户往上滚 → 停止自动跟随
        if (diff > 0 && !userScrolledRef.current) {
          userScrolledRef.current = true;
          setShowScrollBtn(true);
        }

        // 用户手动滚回底部 → 恢复自动跟随
        if (userScrolledRef.current && checkNearBottom()) {
          userScrolledRef.current = false;
          setShowScrollBtn(false);
        }
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [checkNearBottom]);

  /** 自动滚动逻辑（限流 200ms） */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const newMsgCount = messages.length;
    const isNewMessage = newMsgCount > prevCountRef.current;
    prevCountRef.current = newMsgCount;

    // 新消息到达：重置 + 即时滚到底
    if (isNewMessage) {
      userScrolledRef.current = false;
      setShowScrollBtn(false);
      autoScrollAtRef.current = Date.now();
      el.scrollTo({ top: el.scrollHeight - el.clientHeight, behavior: "instant" });
      return;
    }

    // 流式中 + 用户未上拉 → 限流 auto-scroll
    if (isStreaming && !userScrolledRef.current) {
      const now = Date.now();
      if (now - lastAutoScrollAtRef.current >= AUTO_SCROLL_THROTTLE_MS) {
        lastAutoScrollAtRef.current = now;
        autoScrollAtRef.current = now;
        el.scrollTo({ top: el.scrollHeight - el.clientHeight, behavior: "instant" });
      }
    }
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-lg shadow-blue-500/25">
            <span className="text-4xl">🐕</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">Doudou Agent</h1>
          <p className="text-neutral-400 text-sm leading-relaxed">有什么我可以帮你的？</p>
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

  const lastAssistantId = [...messages].reverse().find((m) => m.type === "assistant")?.id;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {messages.map((msg) => {
          const isLastAssistant = msg.type === "assistant" && msg.id === lastAssistantId;
          return (
            <div key={msg.id} className="group">
              <MessageBubble
                message={msg}
                isStreaming={isLastAssistant && isStreaming}
                canRegenerate={isLastAssistant && !isStreaming}
                onRegenerate={regenerate}
              />
            </div>
          );
        })}
        <div style={{ height: 1 }} />
      </div>

      {showScrollBtn && (
        <div className="sticky bottom-4 flex justify-center z-10 pointer-events-none">
          <button
            onClick={handleScrollToBottom}
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
