import { useCallback, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { handleUnauthorizedApiError } from '@/lib/auth-session-guard';
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
    } catch (err) {
      await handleUnauthorizedApiError(err);
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
    } catch (err) {
      await handleUnauthorizedApiError(err);
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [nextCursor]);

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        const updated = await apiClient.updateSession(sessionId, { title });
        patchTitle(sessionId, updated.title ?? title);
        return updated;
      } catch (err) {
        if (await handleUnauthorizedApiError(err)) {
          throw new Error('Session expired');
        }
        throw err;
      }
    },
    [patchTitle]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await apiClient.deleteSession(sessionId);
        removeSession(sessionId);
      } catch (err) {
        await handleUnauthorizedApiError(err);
        throw err;
      }
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
