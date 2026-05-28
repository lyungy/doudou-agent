/**
 * 对话路由：SSE 流式对话接口
 */
import { Router } from "express";
import type { Request, Response } from "express";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { getModelById } from "../services/config.js";
import { getSession, updateSession, openSession } from "../services/session.js";
import { getOrCreateAgent } from "../services/agent.js";

const router = Router();

/**
 * POST /api/chat/stream — SSE 流式对话
 */
router.post("/stream", async (req: Request, res: Response) => {
  const { sessionId, message, modelId } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ error: "缺少 sessionId 或 message" });
  }

  const sessionMeta = getSession(sessionId);
  if (!sessionMeta) {
    return res.status(404).json({ error: "Session 不存在" });
  }

  // 打开 JSONL session 用于持久化消息
  let session: any = null;
  try {
    session = await openSession(sessionId);
  } catch {
    // JSONL 文件可能不存在，忽略
  }

  // 已持久化消息计数（Agent 消息无 id，用计数防重复）
  let persistCount = 0;

  // 将消息写入 JSONL
  const persistMessage = async (msg: any) => {
    if (!session || !msg) return;
    try {
      await session.appendMessage(msg);
      persistCount++;
    } catch (err: any) {
      console.error("[Chat] persist 失败:", err.message);
    }
  };

  // 写 SSE 事件
  const sendEvent = (type: string, data: any) => {
    if (res.writableEnded) return;
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    try { (res as any).flush?.(); } catch {}
  };

  // 心跳
  const heartbeat = setInterval(() => sendEvent("heartbeat", {}), 15000);

  // 客户端断开
  let aborted = false;
  let agentInstance: any = null;
  req.socket.on("close", () => {
    if (!aborted) {
      aborted = true;
      clearInterval(heartbeat);
      agentInstance?.abort();
    }
  });

  try {
    const model = getModelById(modelId || sessionMeta.modelId || undefined);
    const agent = getOrCreateAgent(sessionId, model);
    agentInstance = agent;

    // 订阅事件
    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      if (aborted) return;

      if (event.type === "message_end") {
        const msg = (event as any).message;

        // 错误消息 → 推 error 事件
        if (msg?.stopReason === "error" && msg?.errorMessage) {
          sendEvent("error", { error: msg.errorMessage });
          return;
        }

        // 持久化完整消息（user / assistant）
        if (msg && (msg.role === "user" || msg.role === "assistant")) {
          persistMessage(msg);
        }
      }

      const sseData = convertToSSE(event);
      if (sseData) sendEvent(sseData.type, sseData.data);
    });

    await agent.prompt(message);
    await agent.waitForIdle();

    // 兜底：确保所有 Agent 消息都已持久化（跳过已写的）
    const allMsgs = agent.state.messages;
    for (let i = persistCount; i < allMsgs.length; i++) {
      await persistMessage(allMsgs[i]);
    }

    if (!aborted) sendEvent("done", { reason: "stop" });
    updateSession(sessionId, { messageCount: agent.state.messages.length, modelId: modelId || undefined });
    unsubscribe();
  } catch (err: any) {
    console.error("[Chat] ❌", err.message);
    if (!aborted) sendEvent("error", { error: err.message });
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

router.post("/abort", (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "缺少 sessionId" });
  const { abortAgent } = require("../services/agent.js");
  abortAgent(sessionId);
  res.json({ ok: true });
});

function convertToSSE(event: AgentEvent): { type: string; data: any } | null {
  switch (event.type) {
    case "message_update": {
      const ae = (event as any).assistantMessageEvent;
      if (!ae) return null;
      switch (ae.type) {
        case "text_delta":       return { type: "text_delta", data: { delta: ae.delta } };
        case "thinking_delta":   return { type: "thinking_delta", data: { delta: ae.delta } };
        case "thinking_start":   return { type: "thinking_start", data: {} };
        case "thinking_end":     return { type: "thinking_end", data: {} };
        case "text_start":       return { type: "text_start", data: {} };
        case "text_end":         return { type: "text_end", data: {} };
        case "toolcall_start":   return { type: "tool_start", data: { contentIndex: ae.contentIndex } };
        case "toolcall_end":     return { type: "tool_end", data: { toolCall: ae.toolCall } };
        case "toolcall_delta":   return { type: "tool_delta", data: { contentIndex: ae.contentIndex, partial: ae.partial } };
        case "error":            return { type: "error", data: { error: ae.error } };
      }
      return null;
    }
    case "tool_execution_start":
      return { type: "tool_exec_start", data: { toolCallId: event.toolCallId, toolName: event.toolName, args: event.args } };
    case "tool_execution_end":
      return { type: "tool_exec_end", data: { toolCallId: event.toolCallId, toolName: event.toolName, result: event.result, isError: event.isError } };
    case "tool_execution_update":
      return { type: "tool_exec_update", data: { toolCallId: event.toolCallId, toolName: event.toolName, partialResult: event.partialResult } };
    default:
      return null;
  }
}

export default router;
