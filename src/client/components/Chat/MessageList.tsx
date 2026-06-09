/**
 * 消息列表组件
 * 智能滚动：用户在底部时自动跟随，向上滚动时锁定位置
 */
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MessageBubble } from "./MessageBubble";
import { useChat } from "../../hooks/useChat";
import { useAppStore } from "../../store";

const BOTTOM_THRESHOLD = 50;

export function MessageList() {
  const { messages, isStreaming, regenerate, editMessage, messageSearch, messageSearchOpen, setMessageSearch, setMessageSearchOpen } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /** 检测是否在底部 */
  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  /** 监听滚动事件 */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => setIsAtBottom(checkAtBottom());
    el.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener("scroll", handleScroll);
  }, [checkAtBottom]);

  /** 消息更新时：仅底部状态下自动跟随 */
  useEffect(() => {
    if (isAtBottom) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, isAtBottom]);

  /** 流式输出期间持续跟随 */
  useEffect(() => {
    if (!isStreaming || !isAtBottom) return;
    const el = scrollRef.current;
    if (!el) return;
    let rafId: number;
    const tick = () => {
      if (checkAtBottom()) el.scrollTop = el.scrollHeight;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isStreaming, isAtBottom, checkAtBottom]);

  // 搜索过滤
  const displayMessages = useMemo(() => {
    if (!messageSearch.trim()) return messages;
    const q = messageSearch.toLowerCase();
    return messages.filter((m) => m.content?.toLowerCase().includes(q));
  }, [messages, messageSearch]);

  // Cmd+F 打开搜索
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setMessageSearchOpen(true);
      }
      if (e.key === "Escape" && messageSearchOpen) {
        setMessageSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [messageSearchOpen, setMessageSearchOpen]);

  // 导出对话为 Markdown
  const handleExportChat = useCallback(() => {
    if (messages.length === 0) return;
    const lines: string[] = ["# Doudou Agent 对话导出", "", `导出时间: ${new Date().toLocaleString("zh-CN")}`, "", "---", ""];
    for (const msg of messages) {
      const role = msg.type === "user" ? "👤 用户" : "🤖 AI";
      const time = new Date(msg.timestamp).toLocaleString("zh-CN");
      lines.push(`### ${role} · ${time}`, "");
      if (msg.thinking) {
        lines.push(`> 🧠 思考: ${msg.thinking.slice(0, 200)}${msg.thinking.length > 200 ? "..." : ""}`, "");
      }
      if (msg.content) {
        lines.push(msg.content);
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          lines.push(`> 🔧 工具: ${tc.name} (${tc.status})`);
        }
      }
      lines.push("", "---", "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doudou-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  if (displayMessages.length === 0 && !messageSearch) {
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

  const lastAssistantId = [...displayMessages].reverse().find((m) => m.type === "assistant")?.id;

  return (
    <>
      {/* 搜索栏 + 工具栏 */}
      {(messageSearchOpen || messages.length > 0) && (
        <div className="px-4 py-1.5 bg-white border-b border-neutral-200 flex items-center gap-2">
          {messageSearchOpen ? (
            <>
              <span className="text-neutral-400 text-sm">🔍</span>
              <input
                type="text"
                value={messageSearch}
                onChange={(e) => setMessageSearch(e.target.value)}
                placeholder="搜索消息内容... (Cmd+F)"
                className="flex-1 text-sm bg-transparent outline-none placeholder-neutral-400"
                autoFocus
              />
              {messageSearch && (
                <span className="text-xs text-neutral-400">
                  {messages.filter((m) => m.content?.toLowerCase().includes(messageSearch.toLowerCase())).length} 条结果
                </span>
              )}
              <button
                onClick={() => setMessageSearchOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 text-xs px-2 py-1"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-neutral-400">{messages.length} 条消息</span>
              <div className="flex-1" />
              <button
                onClick={() => setMessageSearchOpen(true)}
                className="text-neutral-400 hover:text-neutral-600 text-xs px-2 py-1 rounded hover:bg-neutral-100 transition-colors"
                title="搜索消息 (Cmd+F)"
              >
                🔍
              </button>
              <button
                onClick={handleExportChat}
                className="text-neutral-400 hover:text-neutral-600 text-xs px-2 py-1 rounded hover:bg-neutral-100 transition-colors"
                title="导出对话为 Markdown"
              >
                📤
              </button>
            </>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {displayMessages.map((msg) => {
            const isLastAssistant = msg.type === "assistant" && msg.id === lastAssistantId;
            return (
              <div key={msg.id} className="group">
                <MessageBubble
                  message={msg}
                  isStreaming={isLastAssistant && isStreaming}
                  canRegenerate={isLastAssistant && !isStreaming}
                  onRegenerate={regenerate}
                  onEdit={msg.type === "user" ? (newContent) => editMessage(msg.id, newContent) : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 回到底部按钮 — fixed 定位，相对于视口，不被任何容器裁剪 */}
      {displayMessages.length > 0 && !isAtBottom && (
        <button
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          }}
          className="fixed bottom-24 right-8 z-50 flex items-center gap-1.5 px-3 py-2 bg-white/90 backdrop-blur-sm border border-neutral-200 rounded-full shadow-lg hover:bg-white hover:shadow-xl transition-all cursor-pointer text-neutral-600 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <span>回到底部</span>
        </button>
      )}
    </>
  );
}
