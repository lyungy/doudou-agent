/**
 * 消息气泡组件
 */
import type { ChatMessage } from "../../types";
import { ToolCallCard } from "./ToolCallCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.type === "user";

  return (
    <div className={`flex gap-3 mb-6 ${isUser ? "justify-end" : "justify-start"}`}>
      {/* AI 头像 */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
          🐕
        </div>
      )}

      {/* 消息内容 */}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-br-md"
            : "bg-white text-neutral-800 shadow-sm border border-neutral-100 rounded-bl-md"
        }`}
      >
        {/* Thinking 内容 */}
        {message.thinking && (
          <ThinkingBlock content={message.thinking} isUser={isUser} isStreaming={isStreaming} />
        )}

        {/* 工具调用（先于文本发生，渲染在前） */}
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
              /* 用户消息：纯文本 */
              <span className="whitespace-pre-wrap">{message.content}</span>
            ) : (
              /* AI 消息：Markdown 渲染 */
              <MarkdownRenderer content={message.content} />
            )}
            {isStreaming && (
              <span className="inline-block w-[3px] h-4 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full ml-0.5 align-text-bottom animate-pulse" />
            )}
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

      {/* 用户头像 */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
          👤
        </div>
      )}
    </div>
  );
}
