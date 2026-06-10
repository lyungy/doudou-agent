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
 * - toolResult: { role: "toolResult", toolCallId, toolName, content, isError }  ← 独立消息
 *
 * SSE 流式格式：
 * - tool_exec_start → { toolCallId, toolName, args }
 * - tool_exec_end   → { toolCallId, toolName, result: {content, details, isError} }
 *
 * 刷新后需要从 toolResult 消息中恢复 result 到对应的 toolCall
 */
export function convertToChatMessages(rawMessages: any[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // 调试：打印原始消息角色分布
  const roles = rawMessages.map((m: any) => m.role);
  const toolResultCount = roles.filter((r: string) => r === "toolResult").length;
  console.log("[convertToChatMessages] raw messages:", rawMessages.length, "roles:", [...new Set(roles)], "toolResults:", toolResultCount);

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
        .map((c: any) => ({
          id: c.toolCallId || "",
          name: c.toolName || "",
          args: c.arguments || {},
          status: "done" as const,
        }));

      if (!textParts && !thinkingParts && (!toolCalls || toolCalls.length === 0)) continue;

      // 从后续的 toolResult 消息中恢复 result 到对应的 toolCall
      if (toolCalls && toolCalls.length > 0) {
        // 收集后续连续的 toolResult 消息（它们紧跟在 assistant 消息之后）
        const toolResults: Record<string, any> = {};
        let j = i + 1;
        while (j < rawMessages.length && rawMessages[j]?.role === "toolResult") {
          const tr = rawMessages[j];
          toolResults[tr.toolCallId] = {
            content: tr.content || [],
            details: tr.details,
            isError: tr.isError || false,
          };
          j++;
        }
        console.log("[convertToChatMessages] assistant msg", i, "toolCalls:", toolCalls.length, "found toolResults:", Object.keys(toolResults).length, "toolCallIds:", toolCalls.map((tc: any) => tc.id), "resultIds:", Object.keys(toolResults));

        // 将 result 附加到对应的 toolCall
        for (const tc of toolCalls) {
          if (toolResults[tc.id]) {
            tc.result = toolResults[tc.id];
            tc.isError = toolResults[tc.id].isError;
          }
        }
      }

      messages.push({
        id: `assistant-${messages.length}`,
        type: "assistant",
        content: textParts,
        thinking: thinkingParts || undefined,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      });
    }
    // role === "toolResult" 已在上面的 assistant 循环中处理，跳过
    else if (msg.role === "toolResult") {
      // 已在对应的 assistant 消息处理中消费，跳过
      continue;
    }
  }

  return messages;
}
