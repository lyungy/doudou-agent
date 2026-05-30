/**
 * 左侧导航栏
 * 新建对话 → 分割线 → 首页 / 会话(可折叠子菜单) / 日志 → 版本号
 */
import { useState } from "react";
import { useAppStore } from "../../store";
import type { MainView } from "../../types";
import { SessionSubMenu } from "./SessionSubMenu";

export function Navigation() {
  const {
    currentView,
    setCurrentView,
    sessionsExpanded,
    toggleSessionsExpanded,
    createSession,
    sessions,
    deleteSessions,
  } = useAppStore();

  // 批量删除状态
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleCreate = async () => {
    await createSession("新对话");
  };

  const enterBatchMode = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
  };

  const exitBatchMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const selectAll = () => {
    if (selectedIds.size === sessions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sessions.map((s) => s.id)));
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除 ${selectedIds.size} 个对话？`)) return;
    await deleteSessions(Array.from(selectedIds));
    exitBatchMode();
  };

  return (
    <div className="w-60 bg-neutral-900 flex flex-col h-full">
      {/* 新建对话 */}
      <div className="px-3 pt-5 pb-4">
        <button
          onClick={handleCreate}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-xl transition-all active:scale-[0.98]"
        >
          <span className="text-lg leading-none">+</span>
          新建对话
        </button>
      </div>

      {/* 分割线 */}
      <div className="mx-3 border-t border-neutral-700/50" />

      {/* 导航项 */}
      <nav className="flex-1 overflow-y-auto px-2 pt-4 pb-3 space-y-1.5">
        {/* 首页 */}
        <NavItem
          icon="🏠"
          label="首页"
          active={currentView === "home"}
          onClick={() => setCurrentView("home")}
        />

        {/* 会话 — 可折叠 */}
        <div>
          <div
            className={`group w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm transition-all duration-150 ${
              currentView === "chat"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
            }`}
          >
            {/* 点击展开/折叠 */}
            <span
              className="flex items-center gap-2.5 flex-1 cursor-pointer"
              onClick={toggleSessionsExpanded}
            >
              <span className="text-sm shrink-0">💬</span>
              <span>会话</span>
            </span>

            {/* 右侧操作区：批量模式 → 操作栏；普通模式 → 🗑 icon + 箭头 */}
            <span className="flex items-center gap-1.5 shrink-0">
              {selectMode ? (
                /* 批量模式操作栏 */
                <>
                  <button
                    onClick={exitBatchMode}
                    className="text-neutral-500 hover:text-white text-xs transition-colors px-1"
                    title="取消"
                  >
                    ✕
                  </button>
                  <button
                    onClick={selectAll}
                    className="text-blue-400 hover:text-blue-300 text-xs transition-colors px-1"
                  >
                    {selectedIds.size === sessions.length ? "取消全选" : "全选"}
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedIds.size === 0}
                    className="text-red-400 hover:text-red-300 disabled:opacity-30 text-xs transition-colors px-1"
                  >
                    删除({selectedIds.size})
                  </button>
                </>
              ) : (
                /* 普通模式：🗑 icon（仅展开时 hover 可见） */
                sessionsExpanded && sessions.length > 0 && (
                  <button
                    onClick={enterBatchMode}
                    className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-neutral-300 text-xs transition-all"
                    title="批量删除"
                  >
                    🗑
                  </button>
                )
              )}

              {/* 展开/折叠箭头 */}
              <span
                className={`text-xs transition-transform duration-200 cursor-pointer ${
                  sessionsExpanded ? "rotate-0" : "-rotate-90"
                }`}
                onClick={toggleSessionsExpanded}
              >
                ▾
              </span>
            </span>
          </div>

          {/* 会话子菜单 */}
          {sessionsExpanded && (
            <SessionSubMenu
              selectMode={selectMode}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
            />
          )}
        </div>

        {/* 日志 */}
        <NavItem
          icon="📋"
          label="日志"
          active={currentView === "logs"}
          onClick={() => setCurrentView("logs")}
        />
      </nav>

      {/* 底部版本号 */}
      <div className="px-3 py-3 border-t border-neutral-700/50 text-xs text-neutral-600">
        Doudou Agent v0.1.0
      </div>
    </div>
  );
}

/** 一级导航项 */
function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm transition-all duration-150 ${
        active
          ? "bg-neutral-800 text-white"
          : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
      }`}
    >
      <span className="text-sm shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
