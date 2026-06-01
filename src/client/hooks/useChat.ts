/**
 * useChat — 对话逻辑 Hook
 */
import { useCallback } from "react";
import { useAppStore } from "../store";

export function useChat() {
  const {
    messages,
    isStreaming,
    currentSessionId,
    sendMessage,
    regenerateMessage,
    abortChat,
    currentText,
    currentThinking,
    currentToolCalls,
  } = useAppStore();

  const send = useCallback(
    async (content: string, images?: Array<{ data: string; mimeType: string }>) => {
      if (isStreaming) return;
      await sendMessage(content, images);
    },
    [isStreaming, sendMessage]
  );

  const regenerate = useCallback(async () => {
    if (isStreaming) return;
    await regenerateMessage();
  }, [isStreaming, regenerateMessage]);

  const abort = useCallback(() => {
    abortChat();
  }, [abortChat]);

  return {
    messages,
    isStreaming,
    currentSessionId,
    send,
    regenerate,
    abort,
    // 流式渲染用
    streamingText: currentText,
    streamingThinking: currentThinking,
    streamingToolCalls: currentToolCalls,
  };
}
