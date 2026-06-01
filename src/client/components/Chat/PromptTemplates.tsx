/**
 * 提示词模板卡片网格
 * 新建会话（消息为空）时显示，点击模板发送消息
 */
import { useEffect } from "react";
import { useAppStore } from "../../store";
import type { PromptTemplate } from "../../types";

/** 按分类分组 */
function groupByCategory(templates: PromptTemplate[]): Map<string, PromptTemplate[]> {
  const groups = new Map<string, PromptTemplate[]>();
  for (const tpl of templates) {
    const cat = tpl.category || "通用";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(tpl);
  }
  return groups;
}

export function PromptTemplates() {
  const { templates, loadingTemplates, loadTemplates, sendTemplate } = useAppStore();

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

  const groups = groupByCategory(templates);

  return (
    <div className="flex-1 flex items-start justify-center overflow-y-auto px-6 py-12">
      <div className="w-full max-w-2xl">
        {/* 标题 */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🐕</div>
          <h2 className="text-lg font-semibold text-neutral-700 mb-1">新对话</h2>
          <p className="text-sm text-neutral-400">选择一个模板开始，或直接在下方输入</p>
        </div>

        {/* 按分类展示 */}
        {Array.from(groups.entries()).map(([category, tpls]) => (
          <div key={category} className="mb-6">
            {groups.size > 1 && (
              <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 px-1">
                {category}
              </h3>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {tpls.map((tpl) => (
                <TemplateCard key={tpl.id} template={tpl} onClick={() => sendTemplate(tpl)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template, onClick }: { template: PromptTemplate; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start p-4 bg-white border border-neutral-200 rounded-xl
                 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5
                 active:translate-y-0 active:shadow-sm
                 transition-all duration-150 text-left cursor-pointer"
    >
      <span className="text-2xl mb-2">{template.icon}</span>
      <span className="text-sm font-medium text-neutral-800 mb-1">{template.name}</span>
      <span className="text-xs text-neutral-400 line-clamp-2">{template.description}</span>
    </button>
  );
}
