/**
 * LLM 请求生命周期追踪器
 *
 * 状态机：connecting → streaming → completed / error / aborted
 * 记录：TTFT（首 token 耗时）、总耗时、token 用量
 * 存储：内存环形缓冲区（500 条）+ JSONL 文件持久化
 */
import { mkdirSync, appendFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
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

/** 内存缓冲区大小 */
const BUFFER_SIZE = 500;

class LLMTracker {
  private records: Map<string, LLMRequestRecord> = new Map();
  private completed: LLMRequestRecord[] = [];
  private completedIndex = 0;
  private idCounter = 0;
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath || join(process.cwd(), "logs", "llm-requests.jsonl");
    // 确保目录存在
    mkdirSync(dirname(this.persistPath), { recursive: true });
    // 启动时加载历史记录并恢复 idCounter
    this.loadFromDisk();
    this.idCounter = this.findMaxId();
  }

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
   * 获取最近的完成记录（内存 + 磁盘历史合并，按时间倒序）
   */
  getRecent(limit = 50): LLMRequestRecord[] {
    const memoryEntries = this.getCompletedEntries();
    const diskEntries = this.loadFromDisk();
    // 合并去重（内存优先，因为内存是最新的）
    const seen = new Set(memoryEntries.map((r) => r.id));
    const merged = [...memoryEntries];
    for (const r of diskEntries) {
      if (!seen.has(r.id)) {
        merged.push(r);
        seen.add(r.id);
      }
    }
    // 按 startTime 倒序
    merged.sort((a, b) => b.startTime - a.startTime);
    return merged.slice(0, limit);
  }

  /**
   * 获取指定 session 的记录
   */
  getBySession(sessionId: string, limit = 50): LLMRequestRecord[] {
    return this.getRecent(1000).filter((r) => r.sessionId === sessionId).slice(0, limit);
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

    // 持久化到磁盘
    this.appendToDisk(record);
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

  /**
   * 追加写入 JSONL 文件
   */
  private appendToDisk(record: LLMRequestRecord): void {
    try {
      const line = JSON.stringify(record) + "\n";
      appendFileSync(this.persistPath, line, "utf-8");
    } catch {
      // 写入失败不影响主流程
    }
  }

  /**
   * 从已有记录中找到最大 ID 数字，避免重启后 ID 重用
   */
  private findMaxId(): number {
    let max = 0;
    const extractNum = (id: string) => {
      const match = id.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };
    for (const r of this.completed) {
      max = Math.max(max, extractNum(r.id));
    }
    for (const r of this.records.values()) {
      max = Math.max(max, extractNum(r.id));
    }
    return max;
  }

  /**
   * 从 JSONL 文件加载历史记录
   */
  private loadFromDisk(): LLMRequestRecord[] {
    try {
      if (!existsSync(this.persistPath)) return [];
      const content = readFileSync(this.persistPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const records: LLMRequestRecord[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as LLMRequestRecord;
          if (entry.id && entry.sessionId && entry.startTime) {
            records.push(entry);
          }
        } catch {
          // 跳过解析失败的行
        }
      }
      // 写入 completed 缓存供 getCompletedEntries 使用
      // 只取最后 BUFFER_SIZE 条
      this.completed = records.slice(-BUFFER_SIZE);
      this.completedIndex = this.completed.length % BUFFER_SIZE;
      return records;
    } catch {
      return [];
    }
  }
}

// ============ 单例 ============

let tracker: LLMTracker | null = null;

/**
 * 初始化 LLMTracker（启动时调用一次）
 */
export function initLLMTracker(persistPath?: string): LLMTracker {
  tracker = new LLMTracker(persistPath);
  return tracker;
}

/**
 * 获取 LLMTracker 实例
 */
export function getLLMTracker(): LLMTracker {
  if (!tracker) {
    tracker = new LLMTracker();
  }
  return tracker;
}

export { LLMTracker };
