import { useCallback, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useChatSidebarStore } from './chatSidebarStore';
import { fetchChatSidebarPage } from './chatSidebarSync';

export function useChatSessions() {
  const sessions = useChatSidebarStore((s) => s.sessions);
  const nextCursor = useChatSidebarStore((s) => s.nextCursor);
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
      await fetchChatSidebarPage();
    } finally {
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      await fetchChatSidebarPage({ cursor: nextCursor, append: true });
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [nextCursor]);

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
