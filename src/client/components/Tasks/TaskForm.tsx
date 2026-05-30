/**
 * 任务创建/编辑表单
 */
import { useState, useEffect } from "react";
import { useAppStore } from "../../store";
import type { Task, TaskType } from "../../types";

interface Props {
  task?: Task | null;
  onClose: () => void;
}

export function TaskForm({ task, onClose }: Props) {
  const { createTask, updateTask } = useAppStore();

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cron, setCron] = useState("");
  const [type, setType] = useState<TaskType>("recurring");
  const [timeout, setTimeout_] = useState(300);
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 编辑模式填充
  useEffect(() => {
    if (task) {
      setName(task.name);
      setPrompt(task.prompt);
      setCron(task.cron);
      setType(task.type);
      setTimeout_(task.timeout);
      setEnabled(task.enabled);
    }
  }, [task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) return setError("请输入任务名称");
    if (!prompt.trim()) return setError("请输入提示词");
    if (!cron.trim()) return setError("请输入 Cron 表达式");

    setSubmitting(true);
    try {
      if (task) {
        await updateTask(task.id, { name, prompt, cron, type, timeout, enabled });
      } else {
        await createTask({ name, prompt, cron, type, timeout, enabled });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="px-6 py-4 border-b border-neutral-200">
          <h3 className="text-lg font-semibold text-neutral-800">
            {task ? "编辑任务" : "新建任务"}
          </h3>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* 任务名称 */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">任务名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：每日数据汇总"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* 提示词 */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">提示词（任务内容）</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="发送给 LLM 的指令..."
              rows={4}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Cron 表达式 */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Cron 表达式
              <span className="text-neutral-400 font-normal ml-2">（分 时 日 月 周）</span>
            </label>
            <input
              type="text"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 9 * * *  （每天 9:00）"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="mt-1.5 flex flex-wrap gap-2">
              {[
                { label: "每分钟", value: "* * * * *" },
                { label: "每小时", value: "0 * * * *" },
                { label: "每天 9:00", value: "0 9 * * *" },
                { label: "每周一 9:00", value: "0 9 * * 1" },
                { label: "每月1号 9:00", value: "0 9 1 * *" },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setCron(preset.value)}
                  className="text-[11px] px-2 py-0.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 类型 + 超时 */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1">任务类型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TaskType)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="recurring">循环</option>
                <option value="once">一次性</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                超时时间 <span className="text-neutral-400 font-normal">（秒）</span>
              </label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeout_(parseInt(e.target.value) || 300)}
                min={10}
                max={3600}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 启用开关 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="task-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="task-enabled" className="text-sm text-neutral-700">
              创建后立即启用
            </label>
          </div>

          {/* 错误提示 */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* 按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "提交中..." : task ? "保存" : "创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
