/**
 * 模板管理页（配置页 tab）
 * 支持查看、新建、编辑、删除、启用/禁用模板
 */
import { useEffect, useState, useCallback } from "react";
import * as api from "../../lib/client";
import type { PromptTemplate } from "../../types";
import { ConfirmModal } from "../common/ConfirmModal";
import { useAppStore } from "../../store";

export function TemplateManager() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | null>(null); // null = 关闭弹窗
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);
  const addToast = useAppStore((s) => s.addToast);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.fetchTemplates();
      setTemplates(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleToggle = async (tpl: PromptTemplate) => {
    try {
      await api.toggleTemplateEnabled(tpl.id, !tpl.enabled);
      loadAll();
    } catch (err: any) {
      addToast("error", `操作失败: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
      loadAll();
    } catch (err: any) {
      addToast("error", `删除失败: ${err.message}`);
    }
  };

  const handleSave = async (data: {
    id?: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    content: string;
  }) => {
    try {
      if (data.id) {
        await api.updateTemplate(data.id, {
          name: data.name,
          description: data.description,
          icon: data.icon,
          category: data.category,
          content: data.content,
        });
      } else {
        await api.createTemplate({
          name: data.name,
          description: data.description,
          icon: data.icon,
          category: data.category,
          content: data.content,
        });
      }
      setEditing(null);
      setCreating(false);
      loadAll();
    } catch (err: any) {
      addToast("error", `保存失败: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-50 overflow-hidden">
      {/* 顶栏 */}
      <div className="px-6 py-4 bg-white border-b border-neutral-200 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-800">📋 模板管理</h1>
        <button
          onClick={() => { setCreating(true); setEditing(null); }}
          className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          + 新建模板
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="text-center py-20 text-neutral-400 text-sm">加载中...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-neutral-400 text-sm">暂无模板，点击右上角新建</p>
          </div>
        ) : (
          <div className="grid gap-2 max-w-3xl mx-auto">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center gap-4 px-4 py-3.5 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 transition-all"
              >
                {/* 图标 */}
                <span className="text-2xl shrink-0">{tpl.icon}</span>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-800">{tpl.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
                      {tpl.category}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400 truncate mt-0.5">{tpl.description}</div>
                  <div className="text-[10px] text-neutral-300 mt-1">{tpl.filePath}</div>
                </div>

                {/* 操作 */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggle(tpl)}
                    className={`px-2 py-1 text-xs rounded-md transition-all ${
                      tpl.enabled
                        ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
                    }`}
                  >
                    {tpl.enabled ? "启用" : "禁用"}
                  </button>
                  <button
                    onClick={() => setEditing(tpl)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                    title="编辑"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setDeleteTarget(tpl)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部统计 */}
      {templates.length > 0 && (
        <div className="px-6 py-3 bg-white border-t border-neutral-200 text-xs text-neutral-400">
          共 {templates.length} 个模板，{templates.filter((t) => t.enabled).length} 个已启用
        </div>
      )}

      {/* 编辑/新建弹窗 */}
      {(editing || creating) && (
        <TemplateEditor
          template={editing}
          onSave={handleSave}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}

      {/* 删除确认 */}
      <ConfirmModal
        open={!!deleteTarget}
        title="删除模板"
        message={`确定删除「${deleteTarget?.name}」？对应的 .md 文件也会被删除。`}
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ============ 编辑弹窗 ============

interface EditorProps {
  template: PromptTemplate | null; // null = 新建
  onSave: (data: { id?: string; name: string; description: string; icon: string; category: string; content: string }) => void;
  onClose: () => void;
}

function TemplateEditor({ template, onSave, onClose }: EditorProps) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [icon, setIcon] = useState(template?.icon || "📝");
  const [category, setCategory] = useState(template?.category || "通用");
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);

  // 编辑模式：加载 .md 内容
  useEffect(() => {
    if (template?.id) {
      setLoadingContent(true);
      api.fetchTemplate(template.id)
        .then((full) => setContent(full.content || ""))
        .catch(() => setContent(""))
        .finally(() => setLoadingContent(false));
    }
  }, [template?.id]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: template?.id,
        name: name.trim(),
        description: description.trim(),
        icon,
        category: category.trim() || "通用",
        content,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col animate-[slideUp_200ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-800">
            {template ? "编辑模板" : "新建模板"}
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg">✕</button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 名称 + 图标 */}
          <div className="flex gap-3">
            <div className="w-16">
              <label className="block text-xs text-neutral-500 mb-1">图标</label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full px-2 py-2 text-center text-xl border border-neutral-200 rounded-lg outline-none focus:border-blue-400"
                maxLength={2}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-neutral-500 mb-1">名称 *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：写代码"
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* 描述 + 分类 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-neutral-500 mb-1">描述</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="一句话说明模板用途"
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-blue-400"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs text-neutral-500 mb-1">分类</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="通用"
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* 提示词内容 */}
          <div>
            <label className="block text-xs text-neutral-500 mb-1">
              提示词内容（Markdown）
              {loadingContent && <span className="ml-2 text-neutral-300">加载中...</span>}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在这里编写提示词内容..."
              rows={12}
              className="w-full px-3 py-2 text-sm font-mono border border-neutral-200 rounded-lg outline-none focus:border-blue-400 resize-y leading-relaxed"
            />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
