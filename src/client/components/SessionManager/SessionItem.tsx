/**
 * Session 列表项组件
 */
import type { SessionMeta } from "../../types";

interface Props {
  session: SessionMeta;
  isActive: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function SessionItem({ session, isActive, selectable, selected, onSelect, onDelete }: Props) {
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

      {/* 标题 */}
      <span className="text-sm truncate flex-1">{session.title}</span>

      {/* 消息数 badge */}
      {session.messageCount > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
          isActive ? "bg-neutral-700 text-neutral-300" : "bg-neutral-800 text-neutral-500"
        }`}>
          {session.messageCount}
        </span>
      )}

      {/* 删除按钮 */}
      {!selectable && (
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
      )}
    </div>
  );
}
