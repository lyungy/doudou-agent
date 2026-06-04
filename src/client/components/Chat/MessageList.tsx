/**
 * 消息列表组件（智能滚动 + 回到底部按钮）
 *
 * 核心逻辑：
 * - 用 `userScrolled` ref 追踪用户是否主动上拉
 * - 用 `autoScrollAt` 时间戳区分程序滚动和用户滚动（debounce 150ms）
 * - 只在以下情况自动滚动：
 *   1. 新消息到达（消息数增加）
 *   2. 流式输出 + 用户未上拉
 * - 用户上拉后停止自动滚动，显示浮动按钮
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { useChat } from "../../hooks/useChat";
import { useAppStore } from "../../store";

/** 距离底部多少 px 以内算「在底部」 */
const BOTTOM_THRESHOLD = 80;
/** 程序触发滚动后，忽略滚动事件的时间窗口 */
const SCROLL_DEBOUNCE_MS = 150;

export function MessageList() {
  const { messages, isStreaming, regenerate } = useChat();
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // 用户是否主动上拉（ref，不触发重渲染）
  const userScrolledRef = useRef(false);
  // 最近一次程序触发滚动的时间戳（用于区分程序滚动和用户滚动）
  const autoScrollAtRef = useRef(0);
  // 上一次消息数量（用于检测新消息到达）
  const prevCountRef = useRef(0);

  /** 平滑滚动到底部（程序触发） */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    // 标记程序滚动时间
    autoScrollAtRef.current = Date.now();
    endRef.current?.scrollIntoView({ behavior });
    userScrolledRef.current = false;
    setShowScrollBtn(false);
  }, []);

  /** 监听用户手动滚动（用 debounce 区分程序滚动和用户滚动） */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      // 程序触发的滚动，忽略
      if (Date.now() - autoScrollAtRef.current < SCROLL_DEBOUNCE_MS) return;

      // 用户手动滚动
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const isNear = dist < BOTTOM_THRESHOLD;

      if (!isNear) {
        // 用户上拉了
        userScrolledRef.current = true;
        setShowScrollBtn(true);
      } else if (userScrolledRef.current) {
        // 用户手动滚回底部
        userScrolledRef.current = false;
        setShowScrollBtn(false);
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  /** 自动滚动逻辑 */
  useEffect(() => {
    const newMsgCount = messages.length;
    const isNewMessage = newMsgCount > prevCountRef.current;
    prevCountRef.current = newMsgCount;

    // 新消息到达：重置用户滚动状态（新对话开始，应该跟到底部）
    if (isNewMessage) {
      userScrolledRef.current = false;
      autoScrollAtRef.current = Date.now();
      endRef.current?.scrollIntoView({ behavior: "instant" });
      setShowScrollBtn(false);
      return;
    }

    // 流式输出中 + 用户未上拉 → 自动滚动
    if (isStreaming && !userScrolledRef.current) {
      autoScrollAtRef.current = Date.now();
      endRef.current?.scrollIntoView({ behavior: "instant" });
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
