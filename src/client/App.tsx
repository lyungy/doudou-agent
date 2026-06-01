/**
 * 主界面布局
 * 左侧导航栏 + 右侧内容区（按 currentView 联动）
 */
import { useAppStore } from "./store";
import { useState } from "react";
import { Navigation } from "./components/Navigation/Navigation";
import { HomePage } from "./components/HomePage";
import { MessageList } from "./components/Chat/MessageList";
import { InputBox } from "./components/Chat/InputBox";
import { ModelSelector } from "./components/Config/ModelSelector";
import { SystemPromptEditor } from "./components/Config/SystemPromptEditor";
import { TemplateManager } from "./components/Config/TemplateManager";
import { PromptTemplates } from "./components/Chat/PromptTemplates";
import { LLMStatusBar } from "./components/Chat/LLMStatusBar";
import { LogPanel } from "./components/Logs/LogPanel";
import { TaskPanel } from "./components/Tasks/TaskPanel";
import { TaskLogList } from "./components/Tasks/TaskLogList";
import { SessionList } from "./components/SessionManager/SessionList";

export default function App() {
  const { currentView, currentSessionId, logSubView } = useAppStore();

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* 左侧导航栏 */}
      <Navigation />

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 首页/对话视图需要顶栏 */}
        {currentView === "home" && (
          <>
            <TopBar />
            <HomePage />
          </>
        )}

        {currentView === "chat" && (
          <>
            <TopBar />
            {currentSessionId ? (
              <ChatView />
            ) : (
              <EmptyChatHint />
            )}
          </>
        )}

        {currentView === "session" && <SessionList />}

        {currentView === "tasks" && (
          <>
            <TopBar />
            <TaskPanel />
          </>
        )}

        {currentView === "logs" && (
          <>
            <TopBar />
            {logSubView === "task-runs" ? <TaskLogList /> : <LogPanel />}
          </>
        )}

        {currentView === "config" && <ConfigView />}
      </div>
    </div>
  );
}

/** 顶栏 — 根据视图决定是否显示模型选择器 */
function TopBar() {
  const { currentView } = useAppStore();

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-neutral-200">
      <div className="flex items-center gap-2">
        <span className="text-xl">🐕</span>
        <span className="font-semibold text-neutral-800">Doudou Agent</span>
      </div>

      {/* 仅对话视图显示模型选择器 */}
      {currentView === "chat" && <ModelSelector />}
    </div>
  );
}

/** 会话视图 — 未选中会话时的提示 */
function EmptyChatHint() {
  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="text-4xl mb-3">💬</div>
        <p className="text-neutral-400 text-sm">请在左侧选择一个会话，或新建对话</p>
      </div>
    </div>
  );
}

/** 对话视图 — 有 session 时：消息为空显示模板卡片，否则显示正常对话 */
function ChatView() {
  const { messages } = useAppStore();

  if (messages.length === 0) {
    return (
      <>
        <PromptTemplates />
        <InputBox />
      </>
    );
  }

  return (
    <>
      <MessageList />
      <LLMStatusBar />
      <InputBox />
    </>
  );
}

/** 配置视图 — tab 切换：配置 / 模板 / 系统提示词 */
function ConfigView() {
  const [tab, setTab] = useState<"config" | "templates" | "prompt">("templates");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab 栏 */}
      <div className="px-6 pt-4 bg-neutral-50">
        <div className="flex gap-1 border-b border-neutral-200">
          {([
            { key: "templates" as const, label: "📋 模板" },
            { key: "prompt" as const, label: "📄 系统提示词" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      {tab === "templates" && <TemplateManager />}
      {tab === "prompt" && <SystemPromptEditor />}
    </div>
  );
}
