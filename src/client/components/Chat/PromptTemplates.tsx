/**
 * 提示词模板卡片网格
 * 新建会话（消息为空）时显示，点击模板将内容填入输入框
 */
import { useEffect } from "react";
import { useAppStore } from "../../store";
import type { PromptTemplate } from "../../types";

export function PromptTemplates() {
  const templates = useAppStore((s) => s.templates);
  const loadingTemplates = useAppStore((s) => s.loadingTemplates);
  const loadTemplates = useAppStore((s) => s.loadTemplates);

  useEffect(() => {
    if (templates.length === 0 && !loadingTemplates) {
      loadTemplates();
    }
  }, [templates.length, loadingTemplates, loadTemplates]);

  if (loadingTemplates && templates.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-neutral-400 text-sm">加载模板中...</div>
      </div>
    );
  }

  if (templates.length === 0) return null;

  return (
    <div className="flex-1 flex items-start justify-center overflow-y-auto px-8 py-16">
      <div className="w-full max-w-2xl">
        {/* 标题 */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🐕</div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">新对话</h2>
          <p className="text-sm text-neutral-500">选择一个模板开始，或直接在下方输入</p>
        </div>

        {/* 模板卡片网格（不分类，统一展示） */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <TemplateCard key={tpl.id} template={tpl} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: PromptTemplate }) {
  const fillTemplate = useAppStore((s) => s.fillTemplate);

  return (
    <button
      onClick={() => fillTemplate(template)}
      className="group flex flex-col items-start p-5 bg-white border border-neutral-200/80 rounded-2xl
                 hover:border-blue-300/60 hover:shadow-md hover:-translate-y-0.5
                 active:translate-y-0 active:shadow-sm
                 transition-all duration-150 text-left cursor-pointer"
    >
      <span className="text-2xl mb-2.5">{template.icon}</span>
      <span className="text-sm font-medium text-neutral-800 mb-1.5">{template.name}</span>
      <span className="text-[13px] text-neutral-400 line-clamp-2">{template.description}</span>
    </button>
  );
}
