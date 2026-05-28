/**
 * 主界面布局
 */
import { SessionList } from "./components/SessionManager/SessionList";
import { MessageList } from "./components/Chat/MessageList";
import { InputBox } from "./components/Chat/InputBox";
import { ModelSelector } from "./components/Config/ModelSelector";

export default function App() {
  return (
    <div className="flex h-screen bg-neutral-50">
      {/* 左侧 Session 列表 */}
      <SessionList />

      {/* 右侧对话区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐕</span>
            <span className="font-semibold text-neutral-800">Doudou Agent</span>
          </div>
          <ModelSelector />
        </div>

        {/* 消息列表 */}
        <MessageList />

        {/* 输入框 */}
        <InputBox />
      </div>
    </div>
  );
}
