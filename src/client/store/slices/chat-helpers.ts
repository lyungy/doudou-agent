/**
 * Chat 辅助函数
 * 从 store 中抽出的消息转换逻辑，供 session slice 和 chat slice 共用
 */
import type { ChatMessage, ToolCallInfo } from "../../types";

/**
 * 将 pi-agent-core 的消息格式转换为前端 ChatMessage
 *
 * JSONL 消息格式：
 * - assistant: { role: "assistant", content: [{ type: "toolCall", toolCallId, toolName, arguments }, ...] }
 * - toolResult: { role: "toolResult", toolCallId, toolName, content, isError }  ← 独立消息，位置不固定
 *
 * SSE 流式格式：
 * - tool_exec_start → { toolCallId, toolName, args }
 * - tool_exec_end   → { toolCallId, toolName, result: {content, details, isError} }
 *
 * 刷新后需要从 toolResult 消息中恢复 result 到对应的 toolCall
 */
export function convertToChatMessages(rawMessages: any[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // 预处理：建立 toolCallId → toolResult 的全局映射
  // toolResult 消息不一定紧跟在 assistant 消息后面，需要全局查找
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

  for (let i = 0; i < rawMessages.length; i++) {
    const msg = rawMessages[i];

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
          const toolCallId = c.toolCallId || "";
          const tc: ToolCallInfo = {
            id: toolCallId,
            name: c.toolName || "",
            args: c.arguments || {},
            status: "done",
          };
          // 从全局映射中恢复 toolResult
          const result = toolResultMap[toolCallId];
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
