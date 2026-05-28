/**
 * 主界面布局
 */
import { useState } from "react";
import { SessionList } from "./components/SessionManager/SessionList";
import { MessageList } from "./components/Chat/MessageList";
import { InputBox } from "./components/Chat/InputBox";
import { ModelSelector } from "./components/Config/ModelSelector";
import { LLMStatusBar } from "./components/Chat/LLMStatusBar";
import { LogPanel } from "./components/Logs/LogPanel";

type MainView = "chat" | "logs";

export default function App() {
  const [view, setView] = useState<MainView>("chat");

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* 左侧 Session 列表 */}
      <SessionList />

      {/* 右侧主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-neutral-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🐕</span>
              <span className="font-semibold text-neutral-800">Doudou Agent</span>
            </div>

            {/* 视图切换 */}
            <div className="flex items-center gap-1 ml-4">
              <ViewTab active={view === "chat"} onClick={() => setView("chat")}>
                💬 对话
              </ViewTab>
              <ViewTab active={view === "logs"} onClick={() => setView("logs")}>
                📋 日志
              </ViewTab>
            </div>
          </div>

          {view === "chat" && <ModelSelector />}
        </div>

        {/* 内容区 */}
        {view === "chat" ? (
          <>
            {/* 消息列表 */}
            <MessageList />

            {/* LLM 状态指示器 */}
            <LLMStatusBar />

            {/* 输入框 */}
            <InputBox />
          </>
        ) : (
          <LogPanel />
        )}
      </div>
    </div>
  );
}

/** 视图切换 Tab */
function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
        active
          ? "bg-blue-50 text-blue-600 font-medium"
          : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}
