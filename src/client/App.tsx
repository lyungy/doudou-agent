/**
 * 主界面布局
 * 左侧导航栏 + 右侧内容区（按 currentView 联动）
 * 路由级 React.lazy 代码分割
 */
import { useAppStore } from "./store";
import { useState, useEffect, lazy, Suspense } from "react";
import { Navigation } from "./components/Navigation/Navigation";
import { ToastContainer } from "./components/common/Toast";

// 懒加载各页面组件（按视图拆分 chunk）
const HomePage = lazy(() => import("./components/HomePage").then((m) => ({ default: m.HomePage })));  
// Note: HomePage is a named export, need wrapper

// 直接用 lazy 的组件
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

  // 初始化：加载模型+会话+从 URL 恢复
  useEffect(() => {
    initApp();
  }, [initApp]);

  // 浏览器前进/后退支持
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const sessionId = e.state?.sessionId || null;
      if (sessionId) {
        // 验证会话是否有效
        const valid = sessions.some((s) => s.id === sessionId);
        if (valid) {
          selectSession(sessionId, false);
          return;
        }
      }
      // 无效或无 session → 回到首页
      useAppStore.getState().setCurrentView("home");
      useAppStore.setState({ currentSessionId: null, messages: [] });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectSession, sessions]);

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* 全局 Toast 通知 */}
      <ToastContainer />

      {/* 左侧导航栏 */}
      <Navigation />

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <Suspense fallback={<PageLoader />}>
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
        </Suspense>
      </div>
    </div>
  );
}

/** 页面加载中 fallback */
function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-50">
      <div className="flex items-center gap-3">
        <span className="w-5 h-5 border-2 border-neutral-300 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-sm text-neutral-400">加载中...</span>
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

/** 对话视图 — 有 session 时：加载中显示骨架屏，空消息显示模板卡片，否则显示正常对话 */
function ChatView() {
  const { messages, loadingSession } = useAppStore();

  if (loadingSession) {
    return (
      <>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-neutral-400">
            <span className="w-4 h-4 border-2 border-neutral-300 border-t-blue-500 rounded-full animate-spin" />
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
