/**
 * 对话路由：SSE 流式对话接口
 * 集成 LLM 请求追踪 + SSE 连接生命周期日志
 */
import { Router } from "express";
import type { Request, Response } from "express";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { getModelById } from "../services/config.js";
import { getSession, updateSession, openSession } from "../services/session.js";
import { getOrCreateAgent, abortAgent } from "../services/agent.js";
import { getLLMTracker } from "../services/llm-tracker.js";
import { getLogger } from "../services/logger.js";

const router = Router();

/**
 * POST /api/chat/stream — SSE 流式对话
 */
router.post("/stream", async (req: Request, res: Response) => {
  const { sessionId, message, modelId, thinkingLevel, images } = req.body;
  const logger = getLogger();
  const tracker = getLLMTracker();

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
      logger.error("sse", "消息持久化失败", { sessionId, error: err.message });
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

  // SSE 连接生命周期日志
  const connectionStart = Date.now();
  let eventCount = 0;
  let connectionClosed = false;

  logger.info("sse", "SSE 连接建立", { sessionId, modelId: modelId || sessionMeta.modelId });

  // LLM 追踪
  const effectiveModelId = modelId || sessionMeta.modelId || "";
  const requestId = tracker.startRequest(sessionId, effectiveModelId);
  let firstTokenSent = false;
  let sseEventCount = 0;

  // 推送 LLM 状态事件
  sendEvent("llm_status", { status: "connecting", requestId });

  // 客户端断开
  let aborted = false;
  let agentInstance: any = null;
  req.socket.on("close", () => {
    if (!aborted) {
      aborted = true;
      connectionClosed = true;
      clearInterval(heartbeat);
      agentInstance?.abort();

      // 记录异常断开
      const duration = Date.now() - connectionStart;
      logger.warn("sse", "SSE 连接客户端断开", { sessionId, duration, eventCount: sseEventCount });

      // LLM 追踪：中止
      tracker.onAbort(requestId);
    }
  });

  try {
    const model = getModelById(modelId || sessionMeta.modelId || undefined);
    logger.debug("sse", `解析模型: ${model.id} (请求modelId=${modelId}, sessionModelId=${sessionMeta.modelId})`, { sessionId });
    const { agent, historyCount } = await getOrCreateAgent(sessionId, model);
    agentInstance = agent;
    logger.info("sse", `Agent 实际模型: ${agent.state.model?.id}`, { sessionId });

    // 支持请求级 thinkingLevel 覆盖
    if (thinkingLevel && typeof thinkingLevel === "string") {
      const validLevels = ["off", "minimal", "low", "medium", "high", "xhigh"];
      if (validLevels.includes(thinkingLevel)) {
        // 模型不支持 thinking 时降级
        if (thinkingLevel !== "off" && !model.reasoning) {
          agent.state.thinkingLevel = "off";
        } else {
          agent.state.thinkingLevel = thinkingLevel as any;
        }
      }
    }

    // 订阅事件
    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      if (aborted) return;

      if (event.type === "message_update") {
        const ae = (event as any).assistantMessageEvent;

        // 首 token 追踪
        if (!firstTokenSent && ae?.type === "text_delta") {
          firstTokenSent = true;
          tracker.onFirstToken(requestId);
          sendEvent("llm_status", { status: "streaming", requestId, ttft: Date.now() - connectionStart });
        }

        // 错误消息
        if (ae?.type === "error") {
          tracker.onError(requestId, ae.error);
          sendEvent("llm_status", { status: "error", requestId, error: ae.error });
        }
      }

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

      // Tool 调用日志
      if (event.type === "tool_execution_start") {
        logger.info("agent", "Tool 调用开始", { sessionId, toolName: event.toolName, toolCallId: event.toolCallId });
      }
      if (event.type === "tool_execution_end") {
        logger.info("agent", "Tool 调用完成", { sessionId, toolName: event.toolName, toolCallId: event.toolCallId, isError: event.isError });
      }

      const sseData = convertToSSE(event);
      if (sseData) {
        sendEvent(sseData.type, sseData.data);
        sseEventCount++;
      }
    });

    // 构造图片内容（pi-ai ImageContent 格式）
    const imageContents = Array.isArray(images)
      ? images
          .filter((img: any) => img && img.data && img.mimeType)
          .map((img: any) => ({
            type: "image" as const,
            data: img.data,
            mimeType: img.mimeType,
          }))
      : undefined;

    await agent.prompt(message, imageContents?.length ? imageContents : undefined);
    await agent.waitForIdle();

    // 兜底：确保所有新增 Agent 消息都已持久化（跳过历史消息和已写的）
    const allMsgs = agent.state.messages;
    const fallbackStart = Math.max(historyCount, persistCount);
    if (fallbackStart < allMsgs.length) {
      logger.info("sse", `兜底持久化: index ${fallbackStart}~${allMsgs.length - 1}（historyCount=${historyCount}, persistCount=${persistCount}）`, { sessionId });
    }
    for (let i = fallbackStart; i < allMsgs.length; i++) {
      await persistMessage(allMsgs[i]);
    }

    if (!aborted) {
      // LLM 追踪：完成
      // 从最后一条 assistant 消息获取 usage（pi-ai 的 Usage 结构）
      const lastAssistant = allMsgs.filter((m: any) => m.role === "assistant").pop();
      const usage = (lastAssistant as any)?.usage;
      tracker.onComplete(requestId, {
        inputTokens: usage?.input,
        outputTokens: usage?.output,
      });

      // 推送最终状态
      const record = tracker.getById(requestId);
      sendEvent("llm_status", {
        status: "completed",
        requestId,
        duration: record?.duration,
        ttft: record?.ttft,
        inputTokens: record?.inputTokens,
        outputTokens: record?.outputTokens,
      });

      sendEvent("done", { reason: "stop" });
    }

    updateSession(sessionId, { messageCount: agent.state.messages.length, modelId: modelId || undefined });
    unsubscribe();
  } catch (err: any) {
    logger.error("sse", "对话处理异常", { sessionId, error: err.message });
    tracker.onError(requestId, err.message);
    sendEvent("llm_status", { status: "error", requestId, error: err.message });
    if (!aborted) sendEvent("error", { error: err.message });
  } finally {
    clearInterval(heartbeat);

    // SSE 连接关闭日志
    if (!connectionClosed) {
      const duration = Date.now() - connectionStart;
      logger.info("sse", "SSE 连接关闭", { sessionId, duration, eventCount: sseEventCount });
    }

    if (!res.writableEnded) res.end();
  }
});

router.post("/abort", (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "缺少 sessionId" });
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
