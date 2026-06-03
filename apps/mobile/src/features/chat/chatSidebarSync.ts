import { useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { useSettingsStore } from '@/stores/settings';
import { prepareNewCompose } from './chatSessionLifecycle';
import { useChatSidebarStore } from './chatSidebarStore';

export const CHAT_SIDEBAR_PAGE_SIZE = 30;

export async function fetchChatSidebarPage(options?: {
  cursor?: string;
  append?: boolean;
}) {
  const data = await apiClient.listSessions({
    limit: CHAT_SIDEBAR_PAGE_SIZE,
    cursor: options?.cursor,
  });
  useChatSidebarStore
    .getState()
    .setPage(data.sessions, data.nextCursor, Boolean(options?.append));
  return data;
}

export function useChatSidebarSync() {
  const selectedPersonalityId = useSettingsStore((s) => s.selectedPersonalityId);
  const lastPersonalityRef = useRef<string | null>(null);

  useEffect(() => {
    void fetchChatSidebarPage();
  }, []);

  useEffect(() => {
    const previous = lastPersonalityRef.current;
    lastPersonalityRef.current = selectedPersonalityId;
    if (previous !== null && previous !== selectedPersonalityId) {
      prepareNewCompose();
    }
  }, [selectedPersonalityId]);
}
