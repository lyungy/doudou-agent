/**
 * 模型选择器组件（精致样式）
 */
import { useEffect } from "react";
import { useAppStore } from "../../store";

export function ModelSelector() {
  const { models, currentModelId, loadingModels, loadModels, setModel } = useAppStore();

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  if (loadingModels) {
    return <span className="text-xs text-neutral-400">加载中...</span>;
  }

  if (models.length === 0) {
    return <span className="text-xs text-neutral-400">无模型</span>;
  }

  const current = models.find((m) => m.id === currentModelId);

  return (
    <div className="flex items-center gap-2">
      <select
        value={currentModelId}
        onChange={(e) => setModel(e.target.value)}
        className="text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 border-0 rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer transition-colors appearance-none pr-6 bg-no-repeat bg-[right_6px_center] bg-[length:10px]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E")`,
        }}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {current?.reasoning && (
        <span className="flex items-center gap-1 text-[10px] bg-purple-50 text-purple-600 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
          Reasoning
        </span>
      )}
    </div>
  );
}
