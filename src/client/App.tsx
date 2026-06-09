/**
 * 主界面布局（大气风格）
 * 左侧导航栏 + 右侧内容区（按 currentView 联动）
 * 路由级 React.lazy 代码分割
 */
import { useAppStore } from "./store";
import { useState, useEffect, lazy, Suspense } from "react";
import { Navigation } from "./components/Navigation/Navigation";
import { ToastContainer } from "./components/common/Toast";

// 懒加载各页面组件
const HomePage = lazy(() => import("./components/HomePage").then((m) => ({ default: m.HomePage })));
const MessageList = lazy(() => import("./components/Chat/MessageList").then((m) => ({ default: m.MessageList })));
const InputBox = lazy(() => import("./components/Chat/InputBox").then((m) => ({ default: m.InputBox })));
const PromptTemplates = lazy(() => import("./components/Chat/PromptTemplates").then((m) => ({ default: m.PromptTemplates })));
const LLMStatusBar = lazy(() => import("./components/Chat/LLMStatusBar").then((m) => ({ default: m.LLMStatusBar })));
const ContextUsageBar = lazy(() => import("./components/Chat/ContextUsageBar").then((m) => ({ default: m.ContextUsageBar })));
const ModelSelector = lazy(() => import("./components/Config/ModelSelector").then((m) => ({ default: m.ModelSelector })));
const SystemPromptEditor = lazy(() => import("./components/Config/SystemPromptEditor").then((m) => ({ default: m.SystemPromptEditor })));
const TemplateManager = lazy(() => import("./components/Config/TemplateManager").then((m) => ({ default: m.TemplateManager })));
const LogPanel = lazy(() => import("./components/Logs/LogPanel").then((m) => ({ default: m.LogPanel })));
const TaskPanel = lazy(() => import("./components/Tasks/TaskPanel").then((m) => ({ default: m.TaskPanel })));
const TaskLogList = lazy(() => import("./components/Tasks/TaskLogList").then((m) => ({ default: m.TaskLogList })));
const SessionList = lazy(() => import("./components/SessionManager/SessionList").then((m) => ({ default: m.SessionList })));
const Dashboard = lazy(() => import("./components/Dashboard/index").then((m) => ({ default: m.Dashboard })));

export default function App() {
  const { currentView, currentSessionId, logSubView, initApp, selectSession, sessions } = useAppStore();

  useEffect(() => {
    initApp();
  }, [initApp]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const sessionId = e.state?.sessionId || null;
      if (sessionId) {
        const valid = sessions.some((s) => s.id === sessionId);
        if (valid) {
          selectSession(sessionId, false);
          return;
        }
      }
      useAppStore.getState().setCurrentView("home");
      useAppStore.setState({ currentSessionId: null, messages: [] });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectSession, sessions]);

  return (
    <div className="flex h-screen bg-neutral-50/50">
      <ToastContainer />
      <Navigation />

      <div className="flex-1 flex flex-col min-w-0">
        <Suspense fallback={<PageLoader />}>
          {currentView === "home" && (
            <>
              <TopBar />
              <HomePage />
            </>
          )}

          {currentView === "chat" && (
            <>
              <TopBar />
              {currentSessionId ? <ChatView /> : <EmptyChatHint />}
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
        </Suspense>
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-blue-500/20">
          🐕
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-4 h-4 border-2 border-neutral-200 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm text-neutral-400">加载中...</span>
        </div>
      </div>
    </div>
  );
}

/** 顶栏 */
function TopBar() {
  const { currentView } = useAppStore();

  return (
    <div className="flex items-center justify-between px-8 py-4 bg-white/80 backdrop-blur-sm border-b border-neutral-200/60">
      <div className="flex items-center gap-3">
        <span className="text-lg">🐕</span>
        <span className="font-semibold text-neutral-800 text-[15px]">Doudou Agent</span>
      </div>
      {currentView === "chat" && <ModelSelector />}
    </div>
  );
}

function EmptyChatHint() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-blue-500/20">
          💬
        </div>
        <p className="text-neutral-500 text-[15px]">请在左侧选择一个会话，或新建对话</p>
      </div>
    </div>
  );
}

function ChatView() {
  const { messages, loadingSession } = useAppStore();

  if (loadingSession) {
    return (
      <>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-neutral-400">
            <span className="w-4 h-4 border-2 border-neutral-200 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm">加载消息中...</span>
          </div>
        </div>
        <InputBox />
      </>
    );
  }

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
      <ContextUsageBar />
      <InputBox />
    </>
  );
}

function ConfigView() {
  const [tab, setTab] = useState<"config" | "templates" | "prompt">("templates");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 pt-6 bg-neutral-50/50">
        <div className="flex gap-1 border-b border-neutral-200/80">
          {([
            { key: "templates" as const, label: "📋 模板" },
            { key: "prompt" as const, label: "📄 系统提示词" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
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

      {tab === "templates" && <TemplateManager />}
      {tab === "prompt" && <SystemPromptEditor />}
    </div>
  );
}
