/**
 * 会话子菜单
 * 左边框标识层级归属，会话项缩进 + 小字号 + 浅色
 */
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useAppStore } from "../../store";
import { SessionItem } from "../SessionManager/SessionItem";

interface Props {
  selectMode: boolean;
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
}

export function SessionSubMenu({ selectMode, selectedIds, setSelectedIds }: Props) {
  const {
    sessions,
    currentSessionId,
    selectSession,
    deleteSession,
    renameSession,
    loadingSessions,
    loadSessions,
  } = useAppStore();

  // 加载会话列表
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loadingSessions) {
    return <div className="text-center text-neutral-500 text-xs py-4 ml-8">加载中...</div>;
  }

  return (
    <div className="ml-4 mt-1.5 pl-3 border-l-2 border-neutral-800 space-y-0.5">
      {sessions.length === 0 ? (
        <div className="text-center text-neutral-600 text-xs py-4">暂无会话</div>
      ) : (
        sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentSessionId}
            selectable={selectMode}
            selected={selectedIds.has(session.id)}
            onSelect={() => (selectMode ? toggleSelect(session.id) : selectSession(session.id))}
            onDelete={() => deleteSession(session.id)}
            onRename={(title) => renameSession(session.id, title)}
          />
        ))
      )}
    </div>
  );
}
