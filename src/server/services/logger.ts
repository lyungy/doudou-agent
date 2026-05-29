/**
 * 结构化日志服务
 * - 级别过滤：debug / info / warn / error
 * - 模块标签：http / llm / agent / sse / system
 * - 文件写入：JSONL 按天滚动，自动清理过期文件
 * - 内存缓存：环形缓冲区（最近 1000 条）供 API 查询
 */
import { mkdirSync, readdirSync, unlinkSync, appendFileSync, existsSync, readFileSync } from "fs";
import { resolve, join } from "path";

/** 日志级别（数值越小优先级越高） */
const LEVEL_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogModule = "http" | "llm" | "agent" | "sse" | "system";

export interface LogEntry {
  timestamp: string;       // ISO 8601
  level: LogLevel;
  module: LogModule | string;
  message: string;
  meta?: Record<string, any>;
}

export interface LogFilter {
  level?: LogLevel;
  module?: string;
  since?: string;          // ISO 8601
  limit?: number;          // 默认 100
  offset?: number;
}

export interface LoggerConfig {
  level: LogLevel;
  dir: string;             // 日志文件目录（绝对路径）
  maxDays: number;         // 保留天数
}

/** 内存环形缓冲区大小 */
const BUFFER_SIZE = 1000;

class Logger {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private writeIndex = 0;
  private count = 0;

  constructor(config: LoggerConfig) {
    this.config = config;
    // 确保日志目录存在
    mkdirSync(config.dir, { recursive: true });
    // 启动时加载历史日志到缓冲区
    this.loadRecentLogs();
    // 启动时清理过期日志
    this.cleanup();
  }

  // ============ 公开方法 ============

  debug(module: LogModule | string, message: string, meta?: Record<string, any>): void {
    this.log("debug", module, message, meta);
  }

  info(module: LogModule | string, message: string, meta?: Record<string, any>): void {
    this.log("info", module, message, meta);
  }

  warn(module: LogModule | string, message: string, meta?: Record<string, any>): void {
    this.log("warn", module, message, meta);
  }

  error(module: LogModule | string, message: string, meta?: Record<string, any>): void {
    this.log("error", module, message, meta);
  }

  /**
   * 查询日志（从内存缓冲区）
   */
  query(filter: LogFilter = {}): { entries: LogEntry[]; total: number } {
    const { level, module, since, limit = 100, offset = 0 } = filter;

    // 从缓冲区取有效条目（按时间倒序）
    let entries = this.getBufferEntries();

    // 过滤
    if (level) {
      const minOrder = LEVEL_ORDER[level] ?? 0;
      entries = entries.filter((e) => (LEVEL_ORDER[e.level] ?? 0) >= minOrder);
    }
    if (module) {
      entries = entries.filter((e) => e.module === module);
    }
    if (since) {
      entries = entries.filter((e) => e.timestamp >= since);
    }

    // 按时间倒序
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const total = entries.length;
    const paged = entries.slice(offset, offset + limit);

    return { entries: paged, total };
  }

  /**
   * 启动时加载最近的日志文件到内存缓冲区
   * 按日期从新到旧加载，直到缓冲区满
   */
  private loadRecentLogs(): void {
    try {
      const files = readdirSync(this.config.dir)
        .filter((f) => f.endsWith(".log"))
        .sort(); // 旧文件在前

      for (const file of files) {
        if (this.count >= BUFFER_SIZE) break;

        const filePath = join(this.config.dir, file);
        const content = readFileSync(filePath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        // 从旧到新逐行填入缓冲区
        for (let i = 0; i < lines.length; i++) {
          if (this.count >= BUFFER_SIZE) break;
          try {
            const entry = JSON.parse(lines[i]) as LogEntry;
            if (entry.timestamp && entry.level && entry.module && entry.message) {
              this.pushToBuffer(entry);
            }
          } catch {
            // 跳过解析失败的行
          }
        }
      }
    } catch {
      // 读取失败不影响启动
    }
  }

  /**
   * 清理过期日志文件
   */
  cleanup(): void {
    try {
      const files = readdirSync(this.config.dir).filter((f) => f.endsWith(".log"));
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.config.maxDays);
      const cutoffStr = this.formatDate(cutoff);

      for (const file of files) {
        // 文件名格式：doudou-YYYY-MM-DD.log
        const dateMatch = file.match(/doudou-(\d{4}-\d{2}-\d{2})\.log/);
        if (dateMatch && dateMatch[1] < cutoffStr) {
          unlinkSync(join(this.config.dir, file));
        }
      }
    } catch {
      // 清理失败不影响主流程
    }
  }

  // ============ 内部方法 ============

  private shouldLog(level: LogLevel): boolean {
    return (LEVEL_ORDER[level] ?? 0) >= (LEVEL_ORDER[this.config.level] ?? 0);
  }

  private log(level: LogLevel, module: LogModule | string, message: string, meta?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    };

    // 写入内存缓冲区
    this.pushToBuffer(entry);

    // 写入文件
    this.writeToFile(entry);

    // 控制台输出（保留原有的终端可见性）
    const dt = new Date(entry.timestamp);
    const date = dt.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
    const time = dt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const ms = String(dt.getMilliseconds()).padStart(3, "0");
    const prefix = `${date} ${time}.${ms} [${level.toUpperCase()}][${module}]`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    const line = `${prefix} ${message}${metaStr}`;

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  private pushToBuffer(entry: LogEntry): void {
    if (this.buffer.length < BUFFER_SIZE) {
      this.buffer.push(entry);
    } else {
      this.buffer[this.writeIndex] = entry;
    }
    this.writeIndex = (this.writeIndex + 1) % BUFFER_SIZE;
    this.count++;
  }

  private getBufferEntries(): LogEntry[] {
    if (this.buffer.length < BUFFER_SIZE) {
      return [...this.buffer];
    }
    // 环形缓冲区：从 writeIndex 开始取，保持时间顺序
    return [
      ...this.buffer.slice(this.writeIndex),
      ...this.buffer.slice(0, this.writeIndex),
    ];
  }

  private writeToFile(entry: LogEntry): void {
    try {
      const dateStr = this.formatDate(new Date(entry.timestamp));
      const filePath = join(this.config.dir, `doudou-${dateStr}.log`);
      const line = JSON.stringify(entry) + "\n";
      appendFileSync(filePath, line, "utf-8");
    } catch {
      // 文件写入失败不影响主流程
    }
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

// ============ 单例 ============

let logger: Logger | null = null;

/**
 * 初始化 Logger（启动时调用一次）
 */
export function initLogger(config: LoggerConfig): Logger {
  logger = new Logger(config);
  logger.info("system", "日志系统已初始化", { dir: config.dir, level: config.level });
  return logger;
}

/**
 * 获取 Logger 实例
 */
export function getLogger(): Logger {
  if (!logger) {
    // 未初始化时提供默认实例（fallback）
    const defaultDir = resolve(process.cwd(), "logs");
    logger = new Logger({ level: "info", dir: defaultDir, maxDays: 7 });
  }
  return logger;
}

export { Logger };
