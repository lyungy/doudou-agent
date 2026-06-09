/**
 * Session 卡片组件（会话管理页使用）
 * 卡片式布局：标题 + 消息预览 + 模型 tag + 消息数 + 时间 + 操作按钮
 */
import { useState, useRef, useEffect, memo } from "react";
import type { SessionMeta, ModelDef } from "../../types";
import { ConfirmModal } from "../common/ConfirmModal";
import { generateSessionUrl } from "../../lib/url";

interface Props {
  session: SessionMeta;
  isActive: boolean;
  selectable?: boolean;
  selected?: boolean;
  models?: ModelDef[];
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onTogglePin?: () => void;
}

/** 格式化时间为相对描述 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 7) return `${diffDay} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

/** 模型名颜色轮转（5 种柔和背景色） */
const MODEL_COLORS = [
  "bg-blue-50 text-blue-600",
  "bg-emerald-50 text-emerald-600",
  "bg-amber-50 text-amber-600",
  "bg-purple-50 text-purple-600",
  "bg-rose-50 text-rose-600",
];

function getModelColor(modelId: string): string {
  let hash = 0;
  for (let i = 0; i < modelId.length; i++) {
    hash = (hash * 31 + modelId.charCodeAt(i)) | 0;
  }
  return MODEL_COLORS[Math.abs(hash) % MODEL_COLORS.length];
}

export const SessionItem = memo(function SessionItem({ session, isActive, selectable, selected, models, onSelect, onDelete, onRename, onTogglePin }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(session.title);
    setEditing(true);
  };

  const confirmEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  // 支持 Ctrl/Cmd + 点击在新标签页打开
  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      window.open(generateSessionUrl(session.id), "_blank");
      return;
    }
    onSelect();
  };

  // 在新标签页打开
  const openInNewTab = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(generateSessionUrl(session.id), "_blank");
  };

  // 模型显示名
  const modelDef = models?.find((m) => m.id === session.modelId);
  const modelName = modelDef?.name || session.modelId || "";
  const isPinned = !!session.pinned;

  return (
    <>
      <div
        className={`group relative flex items-center gap-5 px-5 py-4 rounded-2xl cursor-pointer transition-all duration-150 ${
          selected
            ? "bg-blue-50/80 ring-2 ring-blue-500/20"
            : isActive
              ? "bg-white shadow-md border border-neutral-200/60"
              : "bg-white border border-neutral-200/60 hover:shadow-md hover:border-neutral-300/60"
        }`}
        onClick={handleClick}
      >
        {/* 选择模式：checkbox */}
        {selectable && (
          <input
            type="checkbox"
            checked={selected || false}
            onChange={() => onSelect()}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-neutral-300 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 shrink-0"
          />
        )}

        {/* 内容区 */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={confirmEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-sm font-medium bg-transparent border-b border-neutral-300 outline-none px-0.5 py-0.5 text-neutral-800"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              {/* 置顶图标 */}
              {isPinned && (
                <span className="text-sm shrink-0" title="已置顶">📌</span>
              )}
              <div className="text-sm font-medium text-neutral-800 truncate" onDoubleClick={startEdit} title="双击重命名">
                {session.title}
              </div>
            </div>
          )}

          {/* 消息预览 */}
          {session.lastMessage && (
            <div className="text-xs text-neutral-400 truncate mt-0.5 ml-5">
              {session.lastMessage}
            </div>
          )}

          <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
            {/* 模型 tag */}
            {modelName && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getModelColor(session.modelId)}`}>
                {modelName}
              </span>
            )}
            <span>{session.messageCount} 条消息</span>
            <span>·</span>
            <span>{formatRelativeTime(session.updatedAt)}</span>
          </div>
        </div>

        {/* 操作按钮 */}
        {!selectable && !editing && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* 置顶按钮 */}
            {onTogglePin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin();
                }}
                className={`p-1.5 rounded-lg transition-all ${
                  isPinned
                    ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                    : "text-neutral-400 hover:text-amber-500 hover:bg-amber-50"
                }`}
                title={isPinned ? "取消置顶" : "置顶"}
              >
                📌
              </button>
            )}
            <button
              onClick={startEdit}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
              title="重命名"
            >
              ✏️
            </button>
            <button
              onClick={openInNewTab}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
              title="在新标签页打开"
            >
              🔗
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirm(true);
              }}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all"
              title="删除"
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={showConfirm}
        title="删除会话"
        message={`确定删除「${session.title}」？删除后无法恢复。`}
        confirmText="删除"
        danger
        onConfirm={() => {
          setShowConfirm(false);
          onDelete();
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
});
