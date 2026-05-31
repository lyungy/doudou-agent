/**
 * CLI 共享初始化
 * 所有需要访问后端服务的命令都调用此模块
 * 负责：加载配置 → 初始化日志 → 初始化存储 → 初始化 LLM Tracker → 初始化任务调度器
 */
import { resolve, isAbsolute } from "path";
import type { AppConfig } from "../../server/services/config.js";
import { loadConfig } from "../../server/services/config.js";
import { initStorage } from "../../server/services/session.js";
import { initLogger } from "../../server/services/logger.js";
import { initLLMTracker } from "../../server/services/llm-tracker.js";
import { initTaskScheduler } from "../../server/services/task-scheduler.js";

/** 是否已初始化（防重复） */
let initialized = false;
let cachedConfig: AppConfig | null = null;

/**
 * 初始化 CLI 运行环境
 * - 加载 config.yaml
 * - 初始化日志（warn 级别，CLI 不需要 debug/info）
 * - 初始化存储（SQLite + JSONL）
 * - 初始化 LLM 追踪器
 * - 初始化任务调度器
 *
 * @param options.silent 静默模式，不输出任何初始化信息（默认 true）
 * @param options.logLevel 日志级别（默认 warn）
 */
export function initCLI(options?: {
  silent?: boolean;
  logLevel?: "debug" | "info" | "warn" | "error";
}): AppConfig {
  if (initialized && cachedConfig) {
    return cachedConfig;
  }

  const silent = options?.silent ?? true;
  const logLevel = options?.logLevel ?? "warn";

  // 1. 加载配置
  const config = loadConfig(resolve(process.cwd(), "config.yaml"));

  // 2. 解析日志目录
  const logDir = isAbsolute(config.logging.dir)
    ? config.logging.dir
    : resolve(process.cwd(), config.logging.dir);

  // 3. 初始化日志（静默模式）
  initLogger({
    level: logLevel,
    dir: logDir,
    maxDays: config.logging.max_days,
  });

  // 4. 初始化 LLM 追踪器
  initLLMTracker(resolve(logDir, "llm-requests.jsonl"));

  // 5. 初始化任务调度器
  initTaskScheduler(resolve(process.cwd(), "data"));

  // 6. 初始化存储
  initStorage();

  initialized = true;
  cachedConfig = config;

  return config;
}

/**
 * 获取已缓存的配置（必须先调用 initCLI）
 */
export function getInitializedConfig(): AppConfig {
  if (!cachedConfig) {
    throw new Error("CLI 未初始化，请先调用 initCLI()");
  }
  return cachedConfig;
}
