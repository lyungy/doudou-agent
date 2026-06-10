/**
 * Chat 辅助函数
 * 从 store 中抽出的消息转换逻辑，供 session slice 和 chat slice 共用
 */
import type { ChatMessage, ToolCallInfo } from "../../types";

/**
 * 将 pi-agent-core 的消息格式转换为前端 ChatMessage
 *
 * JSONL 字段名 vs SSE 字段名：
 * - toolCall:  JSONL 用 `id` / `name` / `arguments`，SSE 用 `toolCallId` / `toolName` / `args`
 * - toolResult: 统一用 `toolCallId` / `toolName` / `content`
 */
export function convertToChatMessages(rawMessages: any[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // 预处理：建立 toolCallId → toolResult 的全局映射
  const toolResultMap: Record<string, { content: any; details: any; isError: boolean }> = {};
  for (const msg of rawMessages) {
    if (msg.role === "toolResult" && msg.toolCallId) {
      toolResultMap[msg.toolCallId] = {
        content: msg.content || [],
        details: msg.details,
        isError: msg.isError || false,
      };
    }
  }

  for (const msg of rawMessages) {
    if (msg.role === "user") {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : msg.content?.map((c: any) => c.text || "").join("") || "";
      if (!content.trim()) continue;
      messages.push({
        id: `user-${messages.length}`,
        type: "user",
        content,
        timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      });
    } else if (msg.role === "assistant") {
      const textParts =
        msg.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("") || "";
      const thinkingParts =
        msg.content
          ?.filter((c: any) => c.type === "thinking")
          .map((c: any) => c.thinking || c.text || "")
          .join("") || "";
      const toolCalls = msg.content
        ?.filter((c: any) => c.type === "toolCall")
        .map((c: any) => {
          // JSONL 用 id/name，SSE 用 toolCallId/toolName，兼容两者
          const toolCallId = c.id || c.toolCallId || "";
          const result = toolResultMap[toolCallId];
          const tc: ToolCallInfo = {
            id: toolCallId,
            name: c.name || c.toolName || "",
            args: c.arguments || c.args || {},
            status: "done",
          };
          if (result) {
            tc.result = result;
            tc.isError = result.isError;
          }
          return tc;
        });

      if (!textParts && !thinkingParts && (!toolCalls || toolCalls.length === 0)) continue;

      messages.push({
        id: `assistant-${messages.length}`,
        type: "assistant",
        content: textParts,
        thinking: thinkingParts || undefined,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      });
    }
    // role === "toolResult" 已在预处理中消费，跳过
  }

  return messages;
}
