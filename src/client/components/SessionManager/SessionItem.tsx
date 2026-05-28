/**
 * Session 列表项组件（支持重命名）
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

export function SessionItem({ session, isActive, selectable, selected, onSelect, onDelete, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 进入编辑模式时聚焦
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
      className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
        isActive
          ? "bg-neutral-800 text-white"
          : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
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
          className="w-4 h-4 rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 shrink-0"
        />
      )}

      {/* 会话图标 */}
      <span className="text-sm shrink-0 opacity-60">💬</span>

      {/* 标题：显示模式 vs 编辑模式 */}
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={confirmEdit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={`flex-1 text-sm bg-transparent border-b ${
            isActive ? "border-neutral-600 text-white" : "border-neutral-600 text-neutral-200"
          } outline-none px-0.5 py-0.5`}
        />
      ) : (
        <span className="text-sm truncate flex-1">{session.title}</span>
      )}

      {/* 消息数 badge */}
      {session.messageCount > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
          isActive ? "bg-neutral-700 text-neutral-300" : "bg-neutral-800 text-neutral-500"
        }`}>
          {session.messageCount}
        </span>
      )}

      {/* 操作按钮（非选择模式 + 非编辑模式） */}
      {!selectable && !editing && (
        <>
          <button
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-blue-400 transition-all text-xs shrink-0"
            title="重命名"
          >
            ✏️
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("确定删除这个对话？")) onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all text-xs shrink-0"
            title="删除"
          >
            🗑️
          </button>
        </>
      )}
    </div>
  );
}
