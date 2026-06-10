/**
 * Chat 辅助函数
 * 从 store 中抽出的消息转换逻辑，供 session slice 和 chat slice 共用
 */
import type { ChatMessage, ToolCallInfo } from "../../types";

/**
 * 将 pi-agent-core 的消息格式转换为前端 ChatMessage
 *
 * 匹配策略（优先级从高到低）：
 * 1. toolCallId 精确匹配
 * 2. toolName 匹配（JSONL 中 toolCall 的 toolCallId 可能为空）
 * 3. 位置兜底（按 toolName 出现顺序匹配）
 */
export function convertToChatMessages(rawMessages: any[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // 预处理：收集所有 toolResult 消息，按 toolCallId 和 toolName 建立索引
  const toolResultById: Record<string, any> = {};
  const toolResultsByName: Record<string, any[]> = {}; // 同名可能有多个，用数组
  for (const msg of rawMessages) {
    if (msg.role === "toolResult" && msg.toolCallId) {
      const entry = {
        content: msg.content || [],
        details: msg.details,
        isError: msg.isError || false,
      };
      toolResultById[msg.toolCallId] = entry;
      if (!toolResultsByName[msg.toolName]) toolResultsByName[msg.toolName] = [];
      toolResultsByName[msg.toolName].push(entry);
    }
  }

  // 按 toolName 的消费顺序跟踪（每消费一个 toolResult 就移位）
  const nameConsumed: Record<string, number> = {};

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
          const toolName = c.toolName || "";
          const tc: ToolCallInfo = {
            id: toolCallId,
            name: toolName,
            args: c.arguments || {},
            status: "done",
          };

          // 策略 1：toolCallId 精确匹配
          let result = toolCallId ? toolResultById[toolCallId] : undefined;

          // 策略 2+3：按 toolName 匹配（处理 JSONL 中 toolCallId 为空的情况）
          if (!result && toolName && toolResultsByName[toolName]) {
            const idx = nameConsumed[toolName] || 0;
            if (idx < toolResultsByName[toolName].length) {
              result = toolResultsByName[toolName][idx];
              nameConsumed[toolName] = idx + 1;
            }
          }

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
  }

  return messages;
}
