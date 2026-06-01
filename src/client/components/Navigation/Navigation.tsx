/**
 * 左侧导航栏（一级菜单）
 * 新建对话 → 首页 / 会话 / 定时任务 / 日志(子菜单) / 配置 → 版本号
 */
import { useState } from "react";
import { useAppStore } from "../../store";
import type { MainView, LogSubView } from "../../types";

export function Navigation() {
  const { currentView, setCurrentView, createSession } = useAppStore();
  const [logsExpanded, setLogsExpanded] = useState(false);

  const handleCreate = async () => {
    await createSession("新对话");
  };

  const handleLogClick = (sub: LogSubView) => {
    useAppStore.getState().setLogSubView(sub);
    setCurrentView("logs");
  };

  return (
    <div className="w-52 bg-neutral-900 flex flex-col h-full">
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

      <div className="mx-3 border-t border-neutral-700/50" />

      {/* 导航项 */}
      <nav className="flex-1 overflow-y-auto px-2 pt-4 pb-3 space-y-1.5">
        <NavItem
          icon="🏠"
          label="首页"
          active={currentView === "home"}
          onClick={() => setCurrentView("home")}
        />

        <NavItem
          icon="💬"
          label="会话"
          active={currentView === "session"}
          onClick={() => setCurrentView("session")}
        />

        <NavItem
          icon="⏰"
          label="定时任务"
          active={currentView === "tasks"}
          onClick={() => setCurrentView("tasks")}
        />

        {/* 日志 — 折叠子菜单 */}
        <div>
          <button
            onClick={() => setLogsExpanded(!logsExpanded)}
            className={`w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm transition-all duration-150 ${
              currentView === "logs"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
            }`}
          >
            <span className="text-sm shrink-0">📋</span>
            <span className="flex-1 text-left">日志</span>
            <span
              className={`text-xs transition-transform duration-200 ${
                logsExpanded ? "rotate-0" : "-rotate-90"
              }`}
            >
              ▾
            </span>
          </button>

          {logsExpanded && (
            <div className="ml-4 mt-1.5 pl-3 border-l-2 border-neutral-800 space-y-0.5">
              <LogSubItem
                icon="📊"
                label="系统日志"
                active={currentView === "logs" && useAppStore.getState().logSubView === "system"}
                onClick={() => handleLogClick("system")}
              />
              <LogSubItem
                icon="📝"
                label="任务日志"
                active={currentView === "logs" && useAppStore.getState().logSubView === "task-runs"}
                onClick={() => handleLogClick("task-runs")}
              />
            </div>
          )}
        </div>

        <NavItem
          icon="⚙️"
          label="配置"
          active={currentView === "config"}
          onClick={() => setCurrentView("config")}
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

/** 日志子菜单项 */
function LogSubItem({
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
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] transition-all duration-150 ${
        active
          ? "bg-neutral-800/80 text-white"
          : "text-neutral-500 hover:bg-neutral-800/40 hover:text-neutral-300"
      }`}
    >
      <span className="text-xs shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
