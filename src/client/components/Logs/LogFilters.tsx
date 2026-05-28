/**
 * 日志过滤器组件
 * 支持按级别、模块、时间范围过滤
 */
import type { LogLevel, LogModule } from "../../types";

export interface LogFilterState {
  level: LogLevel | "";
  module: LogModule | "";
  since: string;
}

interface Props {
  filter: LogFilterState;
  onChange: (filter: LogFilterState) => void;
}

const LEVELS: { value: LogLevel | ""; label: string }[] = [
  { value: "", label: "全部级别" },
  { value: "debug", label: "DEBUG" },
  { value: "info", label: "INFO" },
  { value: "warn", label: "WARN" },
  { value: "error", label: "ERROR" },
];

const MODULES: { value: LogModule | ""; label: string }[] = [
  { value: "", label: "全部模块" },
  { value: "http", label: "HTTP" },
  { value: "llm", label: "LLM" },
  { value: "agent", label: "Agent" },
  { value: "sse", label: "SSE" },
  { value: "system", label: "System" },
];

export function LogFilters({ filter, onChange }: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* 级别 */}
      <select
        value={filter.level}
        onChange={(e) => onChange({ ...filter, level: e.target.value as LogLevel | "" })}
        className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>

      {/* 模块 */}
      <select
        value={filter.module}
        onChange={(e) => onChange({ ...filter, module: e.target.value as LogModule | "" })}
        className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        {MODULES.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>

      {/* 时间范围 */}
      <select
        value={filter.since}
        onChange={(e) => onChange({ ...filter, since: e.target.value })}
        className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        <option value="">全部时间</option>
        <option value="5m">最近 5 分钟</option>
        <option value="15m">最近 15 分钟</option>
        <option value="1h">最近 1 小时</option>
        <option value="24h">最近 24 小时</option>
      </select>
    </div>
  );
}

/**
 * 将时间范围快捷值转为 ISO 8601 时间戳
 */
export function resolveTimeRange(since: string): string | undefined {
  if (!since) return undefined;
  const now = new Date();
  const map: Record<string, number> = {
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
  };
  const ms = map[since];
  if (!ms) return undefined;
  return new Date(now.getTime() - ms).toISOString();
}
