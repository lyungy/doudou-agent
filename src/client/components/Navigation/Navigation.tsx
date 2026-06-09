/**
 * 左侧导航栏（大气风格 — 浅色主题）
 * 新建对话 → 首页 / 会话 / 定时任务 / 日志(子菜单) / 配置 → 版本号
 */
import { useState } from "react";
import { useAppStore } from "../../store";
import type { MainView, LogSubView } from "../../types";
import { generateSessionUrl } from "../../lib/url";

export function Navigation() {
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const createSession = useAppStore((s) => s.createSession);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleCreate = async (e?: React.MouseEvent) => {
    if (e && (e.ctrlKey || e.metaKey)) {
      const session = await createSession("新对话");
      window.open(generateSessionUrl(session.id), "_blank");
      return;
    }
    await createSession("新对话");
  };

  const handleLogClick = (sub: LogSubView) => {
    useAppStore.getState().setLogSubView(sub);
    setCurrentView("logs");
  };

  return (
    <div
      className={`${
        collapsed ? "w-[68px]" : "w-60"
      } shrink-0 bg-white border-r border-neutral-200/80 flex flex-col h-full transition-all duration-200 select-none`}
    >
      {/* 品牌区 */}
      <div className={`px-5 pt-6 pb-5 ${collapsed ? "px-3 pt-4 pb-3" : ""}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg shadow-sm shadow-blue-500/20">
              🐕
            </div>
            <div>
              <div className="text-[15px] font-semibold text-neutral-900 leading-tight">Doudou</div>
              <div className="text-[11px] text-neutral-400">AI Agent</div>
            </div>
          </div>
        )}

        <button
          onClick={(e) => handleCreate(e)}
          className={`w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium py-2.5 rounded-xl transition-all active:scale-[0.98] shadow-sm shadow-blue-500/20 ${collapsed ? "px-0" : ""}`}
          title={collapsed ? "新建对话" : "Ctrl+点击在新标签页打开"}
        >
          <span className="text-lg leading-none">+</span>
          {!collapsed && "新建对话"}
        </button>
      </div>

      {/* 导航项 */}
      <nav className={`flex-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"} pb-3 space-y-0.5`}>
        <NavItem
          icon="🏠"
          label={collapsed ? "" : "首页"}
          active={currentView === "home"}
          onClick={() => setCurrentView("home")}
          collapsed={collapsed}
        />

        <NavItem
          icon="💬"
          label={collapsed ? "" : "会话"}
          active={currentView === "session"}
          onClick={() => setCurrentView("session")}
          collapsed={collapsed}
        />

        <NavItem
          icon="⏰"
          label={collapsed ? "" : "定时任务"}
          active={currentView === "tasks"}
          onClick={() => setCurrentView("tasks")}
          collapsed={collapsed}
        />

        {/* 日志 — 折叠子菜单 */}
        {!collapsed ? (
          <div>
            <button
              onClick={() => setLogsExpanded(!logsExpanded)}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-[14px] transition-all duration-150 ${
                currentView === "logs"
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-neutral-500 hover:bg-neutral-100/80 hover:text-neutral-700"
              }`}
            >
              <span className="text-sm shrink-0">📋</span>
              <span className="flex-1 text-left">日志</span>
              <span
                className={`text-[10px] text-neutral-400 transition-transform duration-200 ${
                  logsExpanded ? "rotate-0" : "-rotate-90"
                }`}
              >
                ▾
              </span>
            </button>

            {logsExpanded && (
              <div className="ml-5 mt-1 pl-3 border-l-2 border-neutral-200 space-y-0.5">
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
        ) : (
          <NavItem
            icon="📋"
            label=""
            active={currentView === "logs"}
            onClick={() => handleLogClick("system")}
            collapsed={collapsed}
          />
        )}

        <NavItem
          icon="⚙️"
          label={collapsed ? "" : "配置"}
          active={currentView === "config"}
          onClick={() => setCurrentView("config")}
          collapsed={collapsed}
        />
      </nav>

      {/* 底部：折叠按钮 + 版本号 */}
      <div className={`px-3 py-4 border-t border-neutral-100 ${collapsed ? "px-2" : ""}`}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-2 text-neutral-400 hover:text-neutral-600 transition-colors rounded-lg hover:bg-neutral-100 mb-2"
          title={collapsed ? "展开导航" : "收起导航"}
        >
          <span className={`text-xs transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}>
            ◀
          </span>
        </button>
        {!collapsed && (
          <div className="text-[11px] text-neutral-400 text-center">
            Doudou Agent v0.1.0
          </div>
        )}
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
  collapsed,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-[14px] transition-all duration-150 ${
        active
          ? "bg-blue-50 text-blue-700 font-medium"
          : "text-neutral-500 hover:bg-neutral-100/80 hover:text-neutral-700"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      <span className="text-sm shrink-0">{icon}</span>
      {!collapsed && <span>{label}</span>}
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
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-all duration-150 ${
        active
          ? "bg-blue-50/80 text-blue-700 font-medium"
          : "text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700"
      }`}
    >
      <span className="text-xs shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
