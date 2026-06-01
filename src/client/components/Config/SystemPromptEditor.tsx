/**
 * 系统提示词编辑器
 * 读取 AGENT.md 内容，支持编辑和保存
 */
import { useEffect, useState } from "react";
import { useAppStore } from "../../store";

export function SystemPromptEditor() {
  const { systemPrompt, loadingSystemPrompt, loadSystemPrompt, saveSystemPrompt } = useAppStore();
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初始加载
  useEffect(() => {
    loadSystemPrompt();
  }, [loadSystemPrompt]);

  // 同步到编辑区
  useEffect(() => {
    if (systemPrompt && !editValue) {
      setEditValue(systemPrompt);
    }
  }, [systemPrompt]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await saveSystemPrompt(editValue);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEditValue(systemPrompt);
    setSaved(false);
    setError(null);
  };

  const charCount = editValue.length;
  const hasChanges = editValue !== systemPrompt;

  if (loadingSystemPrompt) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-neutral-400 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-neutral-50 overflow-hidden">
      {/* 顶栏 */}
      <div className="px-6 py-4 bg-white border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-800">系统提示词</h1>
            <p className="text-xs text-neutral-400 mt-1">
              编辑 AGENT.md 文件，控制 AI 的行为和人设。保存后新建会话生效。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
              >
                还原
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                saved
                  ? "bg-green-500 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              }`}
            >
              {saved ? "✓ 已保存" : saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>

      {/* 编辑区 */}
      <div className="flex-1 px-6 py-4 overflow-hidden flex flex-col">
        <div className="flex-1 relative">
          <textarea
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setSaved(false);
              setError(null);
            }}
            placeholder="输入系统提示词..."
            className="w-full h-full resize-none p-4 text-sm text-neutral-800 bg-white border border-neutral-200 rounded-xl outline-none focus:border-blue-400 transition-all font-mono leading-relaxed"
            spellCheck={false}
          />
        </div>

        {/* 底部信息栏 */}
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-4">
            <span className="text-xs text-neutral-400">{charCount} 字符</span>
            {hasChanges && (
              <span className="text-xs text-amber-500">● 未保存的更改</span>
            )}
            {error && (
              <span className="text-xs text-red-500">✕ {error}</span>
            )}
          </div>
          <span className="text-xs text-neutral-400">
            保存后，新建会话将使用更新的提示词
          </span>
        </div>
      </div>
    </div>
  );
}
