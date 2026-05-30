/**
 * 定时任务管理面板
 */
import { useState, useEffect } from "react";
import { useAppStore } from "../../store";
import type { Task } from "../../types";
import { TaskForm } from "./TaskForm";

export function TaskPanel() {
  const { tasks, loadingTasks, loadTasks, deleteTask, toggleTask, triggerTask } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingTask(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTask(null);
  };

  const handleToggle = async (task: Task) => {
    await toggleTask(task.id, !task.enabled);
  };

  const handleTrigger = async (task: Task) => {
    setTriggering(task.id);
    try {
      await triggerTask(task.id);
    } finally {
      setTriggering(null);
    }
  };

  const handleDelete = async (task: Task) => {
    if (!confirm(`确定删除任务「${task.name}」？`)) return;
    await deleteTask(task.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
        <h2 className="text-lg font-semibold text-neutral-800">⏰ 定时任务</h2>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <span>+</span> 新建任务
        </button>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loadingTasks ? (
          <p className="text-center text-neutral-400 py-8">加载中...</p>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">⏰</div>
            <p className="text-neutral-400 text-sm">暂无定时任务</p>
            <p className="text-neutral-400 text-xs mt-1">点击「新建任务」创建</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                triggering={triggering === task.id}
                onToggle={() => handleToggle(task)}
                onEdit={() => handleEdit(task)}
                onTrigger={() => handleTrigger(task)}
                onDelete={() => handleDelete(task)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 创建/编辑表单 */}
      {showForm && <TaskForm task={editingTask} onClose={handleCloseForm} />}
    </div>
  );
}

/** 任务卡片 */
function TaskCard({
  task,
  triggering,
  onToggle,
  onEdit,
  onTrigger,
  onDelete,
}: {
  task: Task;
  triggering: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onTrigger: () => void;
  onDelete: () => void;
}) {
  const statusColor = task.enabled ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500";
  const typeLabel = task.type === "once" ? "一次性" : "循环";

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 hover:border-neutral-300 transition-colors">
      <div className="flex items-start justify-between">
        {/* 左侧信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-neutral-800 truncate">{task.name}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor}`}>
              {task.enabled ? "运行中" : "已暂停"}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
              {typeLabel}
            </span>
          </div>
          <p className="text-xs text-neutral-400 truncate mb-2">{task.prompt}</p>
          <div className="flex items-center gap-4 text-xs text-neutral-400">
            <span>Cron: <code className="bg-neutral-100 px-1 rounded">{task.cron}</code></span>
            <span>超时: {task.timeout}s</span>
            <span>已执行: {task.runCount} 次</span>
            {task.lastRunAt && (
              <span>上次: {new Date(task.lastRunAt).toLocaleString("zh-CN")}</span>
            )}
            {task.nextRunAt && task.enabled && (
              <span>下次: {new Date(task.nextRunAt).toLocaleString("zh-CN")}</span>
            )}
          </div>
        </div>

        {/* 右侧操作 */}
        <div className="flex items-center gap-1.5 ml-4 shrink-0">
          <button
            onClick={onToggle}
            className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
              task.enabled
                ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                : "bg-green-50 text-green-600 hover:bg-green-100"
            }`}
          >
            {task.enabled ? "暂停" : "启用"}
          </button>
          <button
            onClick={onTrigger}
            disabled={triggering}
            className="px-2.5 py-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {triggering ? "执行中..." : "手动触发"}
          </button>
          <button
            onClick={onEdit}
            className="px-2.5 py-1.5 text-xs bg-neutral-50 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            编辑
          </button>
          <button
            onClick={onDelete}
            className="px-2.5 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
