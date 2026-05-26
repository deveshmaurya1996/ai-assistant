import { useCallback } from 'react';
import { Alert } from 'react-native';
import { apiClient } from '@/lib/api-client';
import { useSavedNotesStore } from './savedNotesStore';

export function useSaveNote() {
  const addSavedMessageId = useSavedNotesStore((s) => s.addSavedMessageId);

  return useCallback(
    async (content: string, messageId?: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      try {
        await apiClient.createNote({
          content: trimmed,
          sourceMessageId: messageId,
        });
        if (messageId) {
          addSavedMessageId(messageId);
        }
      } catch (e) {
        Alert.alert('Could not save note', e instanceof Error ? e.message : 'Try again');
        throw e;
      }
    },
    [addSavedMessageId]
  );
}
