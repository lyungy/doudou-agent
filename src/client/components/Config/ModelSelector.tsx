/**
 * 模型选择器 + 思考等级选择器
 */
import { useEffect } from "react";
import { useAppStore } from "../../store";
import type { ThinkingLevel } from "../../types";

/** 思考等级选项 */
const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
];

export function ModelSelector() {
  const {
    models, currentModelId, loadingModels, loadModels, setModel,
    thinkingLevel, setThinkingLevel,
  } = useAppStore();

  useEffect(() => {
    loadModels(); // 同时加载模型列表 + thinking_level 默认值
  }, [loadModels]);

  if (loadingModels) {
    return <span className="text-xs text-neutral-400">加载中...</span>;
  }

  if (models.length === 0) {
    return <span className="text-xs text-neutral-400">无模型</span>;
  }

  const current = models.find((m) => m.id === currentModelId);
  const supportsThinking = current?.reasoning === true;

  return (
    <div className="flex items-center gap-2">
      {/* 模型下拉 */}
      <select
        value={currentModelId}
        onChange={(e) => setModel(e.target.value)}
        className="text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 border-0 rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer transition-colors appearance-none pr-6 bg-no-repeat bg-[right_6px_center] bg-[length:10px]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E")`,
        }}
      >
        {/* 按 provider 分组显示 */}
        {Object.entries(
          models.reduce((groups, m) => {
            const key = m.providerName || "";
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
            return groups;
          }, {} as Record<string, typeof models>)
        ).map(([provider, providerModels]) => (
          provider ? (
            <optgroup key={provider} label={provider}>
              {providerModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ) : (
            providerModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))
          )
        ))}
      </select>

      {/* 思考等级下拉 */}
      <select
        value={thinkingLevel}
        onChange={(e) => setThinkingLevel(e.target.value as ThinkingLevel)}
        disabled={!supportsThinking}
        title={supportsThinking ? "思考等级" : "当前模型不支持 thinking"}
        className={`text-xs border-0 rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/30 cursor-pointer transition-colors appearance-none pr-6 bg-no-repeat bg-[right_6px_center] bg-[length:10px] ${
          supportsThinking
            ? "text-purple-600 bg-purple-50 hover:bg-purple-100"
            : "text-neutral-400 bg-neutral-50 cursor-not-allowed"
        }`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E")`,
        }}
      >
        {THINKING_LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            🧠 {l.label}
          </option>
        ))}
      </select>

      {/* Reasoning 标签 */}
      {current?.reasoning && (
        <span className="flex items-center gap-1 text-[10px] bg-purple-50 text-purple-600 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
          Reasoning
        </span>
      )}
    </div>
  );
}
