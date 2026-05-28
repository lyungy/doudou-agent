/**
 * LLM 请求生命周期追踪器
 *
 * 状态机：connecting → streaming → completed / error / aborted
 * 记录：TTFT（首 token 耗时）、总耗时、token 用量
 * 存储：内存环形缓冲区（500 条），不持久化（日志文件已兜底）
 */
import { getLogger } from "./logger.js";

/** LLM 请求状态 */
export type LLMRequestStatus = "connecting" | "streaming" | "completed" | "error" | "aborted";

/** LLM 请求记录 */
export interface LLMRequestRecord {
  id: string;
  sessionId: string;
  modelId: string;
  status: LLMRequestStatus;
  startTime: number;          // 毫秒时间戳
  firstTokenTime?: number;
  endTime?: number;
  duration?: number;          // 总耗时 ms
  ttft?: number;              // Time To First Token ms
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

/** 缓冲区大小 */
const BUFFER_SIZE = 500;

class LLMTracker {
  private records: Map<string, LLMRequestRecord> = new Map();
  private completed: LLMRequestRecord[] = [];
  private completedIndex = 0;
  private idCounter = 0;

  /**
   * 记录请求发起
   * @returns requestId
   */
  startRequest(sessionId: string, modelId: string): string {
    const id = `req-${++this.idCounter}`;
    const now = Date.now();

    const record: LLMRequestRecord = {
      id,
      sessionId,
      modelId,
      status: "connecting",
      startTime: now,
    };

    this.records.set(id, record);

    const logger = getLogger();
    logger.info("llm", "LLM 请求发起", { requestId: id, sessionId, modelId });

    return id;
  }

  /**
   * 记录首 token（仅首次调用生效）
   */
  onFirstToken(requestId: string): void {
    const record = this.records.get(requestId);
    if (!record || record.firstTokenTime) return;

    const now = Date.now();
    record.firstTokenTime = now;
    record.ttft = now - record.startTime;
    record.status = "streaming";

    const logger = getLogger();
    logger.info("llm", "首 token 返回", { requestId, ttft: record.ttft });
  }

  /**
   * 记录完成
   */
  onComplete(requestId: string, usage?: { inputTokens?: number; outputTokens?: number }): void {
    const record = this.records.get(requestId);
    if (!record) return;

    const now = Date.now();
    record.endTime = now;
    record.duration = now - record.startTime;
    record.status = "completed";
    if (usage) {
      record.inputTokens = usage.inputTokens;
      record.outputTokens = usage.outputTokens;
    }

    const logger = getLogger();
    logger.info("llm", "LLM 请求完成", {
      requestId,
      duration: record.duration,
      ttft: record.ttft,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
    });

    this.moveToCompleted(record);
  }

  /**
   * 记录错误
   */
  onError(requestId: string, error: string): void {
    const record = this.records.get(requestId);
    if (!record) return;

    const now = Date.now();
    record.endTime = now;
    record.duration = now - record.startTime;
    record.status = "error";
    record.error = error;

    const logger = getLogger();
    logger.error("llm", "LLM 请求失败", { requestId, error, duration: record.duration });

    this.moveToCompleted(record);
  }

  /**
   * 记录中止
   */
  onAbort(requestId: string): void {
    const record = this.records.get(requestId);
    if (!record) return;

    const now = Date.now();
    record.endTime = now;
    record.duration = now - record.startTime;
    record.status = "aborted";

    const logger = getLogger();
    logger.warn("llm", "LLM 请求中止", { requestId, duration: record.duration });

    this.moveToCompleted(record);
  }

  /**
   * 获取活跃请求（正在连接或流式传输中）
   */
  getActive(): LLMRequestRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * 获取最近的完成记录
   */
  getRecent(limit = 50): LLMRequestRecord[] {
    const entries = this.getCompletedEntries();
    return entries.slice(0, limit);
  }

  /**
   * 获取指定 session 的记录
   */
  getBySession(sessionId: string, limit = 50): LLMRequestRecord[] {
    const entries = this.getCompletedEntries();
    return entries.filter((r) => r.sessionId === sessionId).slice(0, limit);
  }

  /**
   * 获取指定请求的记录（活跃 + 完成）
   */
  getById(requestId: string): LLMRequestRecord | null {
    return this.records.get(requestId) || this.completed.find((r) => r.id === requestId) || null;
  }

  // ============ 内部方法 ============

  private moveToCompleted(record: LLMRequestRecord): void {
    this.records.delete(record.id);

    if (this.completed.length < BUFFER_SIZE) {
      this.completed.push(record);
    } else {
      this.completed[this.completedIndex] = record;
    }
    this.completedIndex = (this.completedIndex + 1) % BUFFER_SIZE;
  }

  private getCompletedEntries(): LLMRequestRecord[] {
    if (this.completed.length < BUFFER_SIZE) {
      return [...this.completed].reverse();
    }
    return [
      ...this.completed.slice(this.completedIndex).reverse(),
      ...this.completed.slice(0, this.completedIndex).reverse(),
    ];
  }
}

// ============ 单例 ============

const tracker = new LLMTracker();

export function getLLMTracker(): LLMTracker {
  return tracker;
}

export { LLMTracker };
