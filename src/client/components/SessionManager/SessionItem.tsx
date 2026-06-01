/**
 * Session 卡片组件（会话管理页使用）
 * 卡片式布局：标题 + 消息数 + 时间 + 操作按钮
 */
import { useState, useRef, useEffect } from "react";
import type { SessionMeta } from "../../types";

interface Props {
  session: SessionMeta;
  isActive: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
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

export function SessionItem({ session, isActive, selectable, selected, onSelect, onDelete, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
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

  return (
    <div
      className={`group relative flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer transition-all duration-150 border ${
        selected
          ? "border-blue-500/50 bg-blue-500/5"
          : isActive
            ? "border-neutral-300 bg-white shadow-sm"
            : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"
      }`}
      onClick={onSelect}
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
          <div className="text-sm font-medium text-neutral-800 truncate" onDoubleClick={startEdit} title="双击重命名">
            {session.title}
          </div>
        )}
        <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
          <span>{session.messageCount} 条消息</span>
          <span>·</span>
          <span>{formatRelativeTime(session.updatedAt)}</span>
        </div>
      </div>

      {/* 操作按钮 */}
      {!selectable && !editing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={startEdit}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
            title="重命名"
          >
            ✏️
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("确定删除这个对话？")) onDelete();
            }}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all"
            title="删除"
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}
