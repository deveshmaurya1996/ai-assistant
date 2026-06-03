import { useCallback, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useChatSidebarStore } from './chatSidebarStore';

const PAGE_SIZE = 30;

export function useChatSessions() {
  const sessions = useChatSidebarStore((s) => s.sessions);
  const nextCursor = useChatSidebarStore((s) => s.nextCursor);
  const setPage = useChatSidebarStore((s) => s.setPage);
  const removeSession = useChatSidebarStore((s) => s.removeSession);
  const patchTitle = useChatSidebarStore((s) => s.patchTitle);

  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    try {
      const data = await apiClient.listSessions({ limit: PAGE_SIZE });
      setPage(data.sessions, data.nextCursor, false);
    } finally {
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, [setPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const data = await apiClient.listSessions({
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setPage(data.sessions, data.nextCursor, true);
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [nextCursor, setPage]);

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      const updated = await apiClient.updateSession(sessionId, { title });
      patchTitle(sessionId, updated.title ?? title);
      return updated;
    },
    [patchTitle]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await apiClient.deleteSession(sessionId);
      removeSession(sessionId);
    },
    [removeSession]
  );

  return {
    sessions,
    nextCursor,
    refreshing,
    loadingMore,
    refresh,
    loadMore,
    renameSession,
    deleteSession,
  };
}
