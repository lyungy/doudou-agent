/**
 * 任务执行详情弹窗
 * 点击日志行后展示完整执行信息：元数据 + 任务 prompt + 完整 output/error
 */
import { useEffect, useState, useRef } from "react";
import * as api from "../../lib/client";
import type { TaskRun } from "../../types";
import { TASK_STATUS_COLORS, TASK_STATUS_LABELS, formatDuration } from "../../lib/utils";

interface Props {
  runId: string | null;
  onClose: () => void;
}

export function TaskRunDetailModal({ runId, onClose }: Props) {
  const [run, setRun] = useState<TaskRun | null>(null);
  const [taskInfo, setTaskInfo] = useState<{ prompt: string; cron: string; type: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    setError("");
    api.fetchTaskRunDetail(runId)
      .then((data) => {
        setRun(data.run);
        setTaskInfo(data.task);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [runId]);

  // ESC 关闭
  useEffect(() => {
    if (!runId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runId, onClose]);

  if (!runId) return null;

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-[fadeIn_150ms_ease-out]"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col animate-[slideUp_200ms_ease-out]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h3 className="text-base font-semibold text-neutral-800">📋 执行详情</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="w-5 h-5 border-2 border-neutral-200 border-t-blue-500 rounded-full animate-spin" />
              <span className="ml-3 text-sm text-neutral-400">加载中...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          ) : run ? (
            <div className="space-y-5">
              {/* 元数据 */}
              <div className="grid grid-cols-2 gap-3">
                <MetaItem label="任务名称" value={run.taskName} />
                <MetaItem
                  label="状态"
                  value={
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${TASK_STATUS_COLORS[run.status] || ""}`}>
                      {TASK_STATUS_LABELS[run.status] || run.status}
                    </span>
                  }
                />
                <MetaItem label="开始时间" value={new Date(run.startedAt).toLocaleString("zh-CN")} />
                <MetaItem label="结束时间" value={run.finishedAt ? new Date(run.finishedAt).toLocaleString("zh-CN") : "-"} />
                <MetaItem label="耗时" value={run.duration ? formatDuration(run.duration) : "-"} />
                <MetaItem label="Session ID" value={<span className="font-mono text-[11px] text-neutral-500">{run.sessionId}</span>} />
              </div>

              {/* 任务 Prompt */}
              {taskInfo?.prompt && (
                <Section title="📝 任务 Prompt" content={taskInfo.prompt} />
              )}

              {/* 输出 */}
              {run.output && (
                <Section title="✅ 输出" content={run.output} color="emerald" />
              )}

              {/* 错误 */}
              {run.error && (
                <Section title="❌ 错误" content={run.error} color="red" />
              )}

              {/* 无输出无错误 */}
              {!run.output && !run.error && run.status !== "running" && (
                <p className="text-sm text-neutral-400 text-center py-4">无输出内容</p>
              )}
            </div>
          ) : null}
        </div>

        {/* 底部 */}
        <div className="flex justify-end px-6 py-3 border-t border-neutral-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-neutral-400 mb-0.5">{label}</div>
      <div className="text-sm text-neutral-800">{value}</div>
    </div>
  );
}

function Section({ title, content, color }: { title: string; content: string; color?: "emerald" | "red" }) {
  const borderColor = color === "red" ? "border-red-200" : color === "emerald" ? "border-emerald-200" : "border-neutral-200";
  const bgColor = color === "red" ? "bg-red-50" : color === "emerald" ? "bg-emerald-50" : "bg-neutral-50";

  return (
    <div>
      <div className="text-xs font-medium text-neutral-600 mb-1.5">{title}</div>
      <pre className={`text-[13px] leading-relaxed whitespace-pre-wrap ${bgColor} ${borderColor} border rounded-lg p-3.5 max-h-64 overflow-y-auto font-mono`}>
        {content}
      </pre>
    </div>
  );
}
