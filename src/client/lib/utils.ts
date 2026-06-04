/**
 * 前端通用工具函数
 * 消除各组件间的重复定义
 */

/** 格式化耗时（毫秒） */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

/** 格式化时间戳为本地时间字符串 */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date} ${time}`;
}

/** 格式化 ISO 时间字符串 */
export function formatISOTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN");
}

// ============ 任务状态 ============

export const TASK_STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-50 text-blue-600",
  success: "bg-green-50 text-green-600",
  failed: "bg-red-50 text-red-600",
  timeout: "bg-amber-50 text-amber-600",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  running: "执行中",
  success: "成功",
  failed: "失败",
  timeout: "超时",
};

// ============ LLM 请求状态 ============

export const LLM_STATUS_COLORS: Record<string, string> = {
  connecting: "bg-blue-100 text-blue-700",
  streaming: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700",
  aborted: "bg-amber-100 text-amber-700",
};

export const LLM_STATUS_LABELS: Record<string, string> = {
  connecting: "连接中",
  streaming: "推理中",
  completed: "完成",
  error: "错误",
  aborted: "中止",
};

// ============ 日志级别 ============

export const LOG_LEVEL_COLORS: Record<string, string> = {
  debug: "bg-neutral-100 text-neutral-500",
  info: "bg-blue-50 text-blue-600",
  warn: "bg-amber-50 text-amber-600",
  error: "bg-red-50 text-red-600",
};

export const LOG_MODULE_COLORS: Record<string, string> = {
  http: "bg-purple-50 text-purple-600",
  llm: "bg-cyan-50 text-cyan-600",
  agent: "bg-green-50 text-green-600",
  sse: "bg-orange-50 text-orange-600",
  system: "bg-neutral-100 text-neutral-600",
};

// ============ 时间范围解析 ============

/** 将时间范围快捷值转为 ISO 8601 时间戳 */
export function resolveTimeRange(since: string): string | undefined {
  if (!since) return undefined;
  const now = new Date();
  const map: Record<string, number> = {
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const ms = map[since];
  if (!ms) return undefined;
  return new Date(now.getTime() - ms).toISOString();
}
