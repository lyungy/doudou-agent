/**
 * useSession — Session 状态管理 Hook
 */
import { useEffect, useCallback } from "react";
import { useAppStore } from "../store";

export function useSession() {
  const {
    sessions,
    currentSessionId,
    loadingSessions,
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
    deleteSessions,
    renameSession,
  } = useAppStore();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const currentSession = sessions.find((s) => s.id === currentSessionId) || null;

  const create = useCallback(
    async (title?: string) => {
      return await createSession(title);
    },
    [createSession]
  );

  const select = useCallback(
    async (id: string) => {
      await selectSession(id);
    },
    [selectSession]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteSession(id);
    },
    [deleteSession]
  );

  const removeBatch = useCallback(
    async (ids: string[]) => {
      await deleteSessions(ids);
    },
    [deleteSessions]
  );

  const rename = useCallback(
    async (id: string, newTitle: string) => {
      await renameSession(id, newTitle);
    },
    [renameSession]
  );

  return {
    sessions,
    currentSession,
    currentSessionId,
    loadingSessions,
    create,
    select,
    remove,
    removeBatch,
    rename,
  };
}
