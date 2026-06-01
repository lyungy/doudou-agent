/**
 * 消息气泡组件
 * 支持：复制 + 重新生成（最后一条 AI 消息）
 */
import { useState, useCallback } from "react";
import type { ChatMessage } from "../../types";
import { ToolCallCard } from "./ToolCallCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";

/** 图片点击放大模态框 */
function ImageWithModal({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt="图片"
        className="max-w-[200px] max-h-[200px] rounded-lg border border-neutral-200 cursor-pointer hover:opacity-80 transition-opacity object-cover"
        onClick={() => setOpen(true)}
      />
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt="图片"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center text-xl transition-colors"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  /** 是否为最后一条 AI 消息（用于显示重新生成按钮） */
  canRegenerate?: boolean;
  /** 重新生成回调 */
  onRegenerate?: () => void;
}

export function MessageBubble({ message, isStreaming, canRegenerate, onRegenerate }: Props) {
  const isUser = message.type === "user";
  const [copied, setCopied] = useState(false);

  // 复制消息内容
  const handleCopy = useCallback(async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback：创建临时 textarea
      const ta = document.createElement("textarea");
      ta.value = message.content;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [message.content]);

  return (
    <div className={`flex gap-3 mb-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {/* AI 头像 */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
          🐕
        </div>
      )}

      {/* 消息内容 + 操作栏 */}
      <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`w-full rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-br-md"
              : "bg-white text-neutral-800 shadow-sm border border-neutral-100 rounded-bl-md"
          }`}
        >
          {/* Thinking 内容 */}
          {message.thinking && (
            <ThinkingBlock content={message.thinking} isUser={isUser} isStreaming={isStreaming} />
          )}

          {/* 工具调用 */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {message.toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {/* 消息正文 */}
          {message.content && (
            <div className="break-words text-[14px] leading-relaxed">
              {isUser ? (
                <span className="whitespace-pre-wrap">{message.content}</span>
              ) : (
                <MarkdownRenderer content={message.content} />
              )}
              {isStreaming && (
                <span className="inline-block w-[3px] h-4 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full ml-0.5 align-text-bottom animate-pulse" />
              )}
            </div>
          )}

          {/* 多模态图片 */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {message.images.map((img, idx) => {
                const src = `data:${img.mimeType};base64,${img.data}`;
                return <ImageWithModal key={idx} src={src} />;
              })}
            </div>
          )}

          {/* 空消息（流式开始前） */}
          {!message.content && !message.thinking && !message.toolCalls && isStreaming && (
            <div className="flex items-center gap-1.5 py-1">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
            </div>
          )}
        </div>

        {/* 操作按钮栏 — 悬浮在气泡下方 */}
        {!isStreaming && message.content && (
          <div
            className={`flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
              isUser ? "justify-end" : "justify-start"
            }`}
            style={{ opacity: undefined }}
          >
            <ActionButton
              icon={copied ? "✓" : "📋"}
              label={copied ? "已复制" : "复制"}
              onClick={handleCopy}
              active={copied}
            />
            {canRegenerate && onRegenerate && (
              <ActionButton
                icon="🔄"
                label="重新生成"
                onClick={onRegenerate}
              />
            )}
          </div>
        )}
      </div>

      {/* 用户头像 */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
          👤
        </div>
      )}
    </div>
  );
}

/** 操作按钮 */
function ActionButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-all ${
        active
          ? "text-green-600 bg-green-50"
          : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
      }`}
      title={label}
    >
      <span className="text-[11px]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
