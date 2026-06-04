import { useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { hasAuthCredentials } from '@/lib/auth-cookies';
import { handleUnauthorizedApiError } from '@/lib/auth-session-guard';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { prepareNewCompose } from './chatSessionLifecycle';
import { useChatSidebarStore } from './chatSidebarStore';

export const CHAT_SIDEBAR_PAGE_SIZE = 30;

export async function fetchChatSidebarPage(options?: {
  cursor?: string;
  append?: boolean;
}) {
  if (!hasAuthCredentials()) return null;

  try {
    const data = await apiClient.listSessions({
      limit: CHAT_SIDEBAR_PAGE_SIZE,
      cursor: options?.cursor,
    });
    useChatSidebarStore
      .getState()
      .setPage(data.sessions, data.nextCursor, Boolean(options?.append));
    return data;
  } catch (err) {
    if (await handleUnauthorizedApiError(err)) return null;
    throw err;
  }
}

export function useChatSidebarSync() {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const selectedPersonalityId = useSettingsStore((s) => s.selectedPersonalityId);
  const lastPersonalityRef = useRef<string | null>(null);
  const fetchedRef = useRef(false);

  const canFetch = Boolean(session && hydrated && hasAuthCredentials());

  useEffect(() => {
    if (!canFetch) {
      fetchedRef.current = false;
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void fetchChatSidebarPage().catch(() => {
      fetchedRef.current = false;
    });
  }, [canFetch]);

  useEffect(() => {
    const previous = lastPersonalityRef.current;
    lastPersonalityRef.current = selectedPersonalityId;
    if (previous !== null && previous !== selectedPersonalityId) {
      prepareNewCompose();
    }
  }, [selectedPersonalityId]);
}
