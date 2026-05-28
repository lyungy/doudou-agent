/**
 * 消息列表组件（含欢迎页）
 */
import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { useChat } from "../../hooks/useChat";

export function MessageList() {
  const { messages, isStreaming } = useChat();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
              <span
                key={hint}
                className="px-3 py-1.5 bg-neutral-100 text-neutral-500 text-xs rounded-full"
              >
                {hint}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {messages.map((msg) => {
          const isLastAssistant =
            msg.type === "assistant" && isStreaming;

          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={isLastAssistant}
            />
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
