/**
 * Session 列表组件（深色侧边栏 + 批量删除）
 */
import { useState } from "react";
import { useSession } from "../../hooks/useSession";
import { SessionItem } from "./SessionItem";

export function SessionList() {
  const { sessions, currentSessionId, create, select, remove, removeBatch, loadingSessions } = useSession();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleCreate = async () => {
    await create("新对话");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === sessions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sessions.map((s) => s.id)));
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除 ${selectedIds.size} 个对话？`)) return;
    await removeBatch(Array.from(selectedIds));
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="w-72 bg-neutral-900 flex flex-col h-full transition-all">
      {/* 标题栏 */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🐕</span>
            <span className="text-lg font-bold text-white tracking-tight">Doudou</span>
          </div>
        </div>

        {/* 操作按钮 */}
        {selectMode ? (
          <div className="flex items-center justify-between">
            <button onClick={exitSelectMode} className="text-neutral-400 hover:text-white text-sm transition-colors">
              ✕ 取消
            </button>
            <div className="flex items-center gap-3">
              <button onClick={selectAll} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                {selectedIds.size === sessions.length ? "取消全选" : "全选"}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-30 transition-colors"
              >
                删除 ({selectedIds.size})
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-xl transition-all active:scale-[0.98]"
            >
              <span className="text-lg leading-none">+</span>
              新建对话
            </button>
            {sessions.length > 0 && (
              <button
                onClick={() => setSelectMode(true)}
                className="px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl text-sm transition-all"
                title="批量管理"
              >
                ☰
              </button>
            )}
          </div>
        )}
      </div>

      {/* 分割线 */}
      <div className="mx-4 border-t border-neutral-700/50" />

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-thin">
        {loadingSessions ? (
          <div className="text-center text-neutral-500 text-sm py-8">加载中...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center text-neutral-500 text-sm py-8">
            <div className="text-3xl mb-2">💬</div>
            暂无对话
          </div>
        ) : (
          sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === currentSessionId}
              selectable={selectMode}
              selected={selectedIds.has(session.id)}
              onSelect={() => (selectMode ? toggleSelect(session.id) : select(session.id))}
              onDelete={() => remove(session.id)}
            />
          ))
        )}
      </div>

      {/* 底部 */}
      <div className="px-4 py-3 border-t border-neutral-700/50 text-xs text-neutral-600">
        Doudou Agent v0.1.0
      </div>
    </div>
  );
}
