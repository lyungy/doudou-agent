/**
 * 对话路由：SSE 流式对话接口
 * 集成 LLM 请求追踪 + SSE 连接生命周期日志
 */
import { Router } from "express";
import type { Request, Response } from "express";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { getModelById } from "../services/config.js";
import { getSession, updateSession, openSession } from "../services/session.js";
import { getOrCreateAgent, abortAgent, getAgentState } from "../services/agent.js";
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

  // SSE 响应头：立即发送并禁用超时，防止长连接被服务端/代理断开
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setTimeout(0);           // 禁用响应超时（Node 默认 120s）
  try { res.flushHeaders(); } catch {}  // 立即发送 headers

  // 写 SSE 事件
  const sendEvent = (type: string, data: any) => {
    if (res.writableEnded) return;
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    try { (res as any).flush?.(); } catch {}
  };

  // 心跳：8 秒间隔（多数代理/CDN 空闲超时 ≥ 60s，8s 足以保持连接活跃）
  // 工具执行期间 Agent 内部无 text_delta 输出，心跳是唯一的保活手段
  const heartbeat = setInterval(() => sendEvent("heartbeat", {}), 8000);

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

  // 客户端断开（刷新/关闭页面）
  // 注意：不 abort Agent，让它在后台完成执行并持久化消息
  // 刷新后前端会重新加载消息，用户可继续对话
  let aborted = false;
  let agentInstance: any = null;
  req.socket.on("close", () => {
    if (!aborted) {
      aborted = true;
      connectionClosed = true;
      clearInterval(heartbeat);

      // 不 abort agent，让它后台完成
      const duration = Date.now() - connectionStart;
      logger.info("sse", "SSE 连接客户端断开，Agent 继续后台执行", { sessionId, duration, eventCount: sseEventCount });
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

    // 捕获 usage：取最后一轮 LLM 的 usage（最可靠，代表当前上下文大小）
    let capturedUsage: { input?: number; output?: number } | null = null;

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

        // 在 message_end 中捕获 usage（覆盖式，取最后一轮的值）
        if (msg?.role === "assistant" && msg?.usage) {
          capturedUsage = msg.usage;
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

    try {
      await agent.waitForIdle();
    } catch (waitErr: any) {
      // waitForIdle 异常（如 LLM 调用失败、工具执行超时）时兜底通知前端
      logger.warn("sse", `waitForIdle 异常: ${waitErr.message}`, { sessionId });
      if (!aborted) {
        sendEvent("error", { error: waitErr.message || "Agent 执行异常" });
      }
    }

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
      // 优先使用 message_end 事件中捕获的 usage（最可靠）
      // 兜底从 agent.state.messages 取最后一条 assistant 消息的 usage
      const lastAssistant = allMsgs.filter((m: any) => m.role === "assistant").pop();
      const fallbackUsage = (lastAssistant as any)?.usage;
      const finalUsage = capturedUsage || fallbackUsage;
      // 实际上下文大小 = inputTokens + cacheRead（非缓存部分 + 缓存命中部分）
      const actualInputTokens = (finalUsage?.input || 0) + ((finalUsage as any)?.cacheRead || 0);
      tracker.onComplete(requestId, {
        inputTokens: actualInputTokens || undefined,
        outputTokens: finalUsage?.output,
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

/**
 * GET /api/chat/status/:sessionId — 检测 Agent 是否在流式中
 */
router.get("/status/:sessionId", (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const state = getAgentState(sessionId);
  if (!state || !state.isStreaming) {
    return res.json({ streaming: false });
  }
  res.json({ streaming: true, messageCount: state.messageCount });
});

/**
 * GET /api/chat/resume/:sessionId — 重连 SSE，接收正在流式的内容
 * 前端刷新后检测到 Agent 仍在执行，自动重连继续接收输出
 */
router.get("/resume/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const logger = getLogger();

  const state = getAgentState(sessionId);
  if (!state?.isStreaming) {
    return res.status(404).json({ error: "Agent 不在流式状态" });
  }

  // SSE headers：禁用超时，防止重连期间被断开
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setTimeout(0);           // 禁用响应超时
  try { res.flushHeaders(); } catch {}

  const sendEvent = (type: string, data: any) => {
    if (res.writableEnded) return;
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    try { (res as any).flush?.(); } catch {}
  };

  // 从 agent 获取当前已累积的内容，一次性推送给前端
  const { getAgentForResume } = await import("../services/agent.js");
  const agent = getAgentForResume(sessionId);
  if (!agent) {
    sendEvent("error", { error: "Agent 不存在" });
    res.end();
    return;
  }

  // 推送 catchup：当前流式消息的已累积内容
  const streamingMsg = agent.state.streamingMessage as any;
  if (streamingMsg) {
    const content = streamingMsg.content || [];
    const text = content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("") || "";
    const thinking = content
      .filter((c: any) => c.type === "thinking")
      .map((c: any) => c.thinking || c.text || "")
      .join("") || "";
    const toolCalls = content
      .filter((c: any) => c.type === "toolCall")
      .map((c: any) => ({
        id: c.toolCallId || "",
        name: c.toolName || "",
        args: c.arguments || {},
        status: "done" as const,
      }));

    sendEvent("catchup", { text, thinking, toolCalls: toolCalls.length ? toolCalls : undefined });
  }

  // 心跳：与 /stream 保持一致的 8 秒间隔
  const heartbeat = setInterval(() => sendEvent("heartbeat", {}), 8000);

  let closed = false;
  req.socket.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    logger.info("sse", "Resume SSE 连接断开", { sessionId });
  });

  // 订阅 Agent 后续事件，实时转发
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    if (closed) return;
    const sseData = convertToSSE(event);
    if (sseData) {
      sendEvent(sseData.type, sseData.data);
    }
  });

  // 等待 Agent 执行完成
  try {
    await agent.waitForIdle();
  } catch (err: any) {
    // waitForIdle 异常时也要通知前端，避免前端永远挂起
    logger.warn("sse", `Resume waitForIdle 异常: ${err.message}`, { sessionId });
    if (!closed) sendEvent("error", { error: err.message || "Agent 执行异常" });
  }

  unsubscribe();
  clearInterval(heartbeat);
  if (!closed && !res.writableEnded) {
    sendEvent("done", { reason: "stop" });
    res.end();
  }
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
