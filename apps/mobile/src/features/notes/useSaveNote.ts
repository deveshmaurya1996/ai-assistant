import { useCallback } from 'react';
import { Alert } from 'react-native';
import { apiClient } from '@/lib/api-client';
import { useSavedNotesStore } from './savedNotesStore';

export function useSaveNote() {
  const addSavedMessageId = useSavedNotesStore((s) => s.addSavedMessageId);
  const removeSavedMessageId = useSavedNotesStore((s) => s.removeSavedMessageId);

  return useCallback(
    async (content: string, messageId?: string) => {
      const trimmed = content.trim();
      if (!trimmed || !messageId) return;

      const alreadySaved = useSavedNotesStore.getState().savedMessageIds.has(messageId);

      if (alreadySaved) {
        removeSavedMessageId(messageId);
        try {
          await apiClient.deleteNoteByMessageId(messageId);
        } catch (e) {
          addSavedMessageId(messageId);
          Alert.alert('Could not remove note', e instanceof Error ? e.message : 'Try again');
          throw e;
        }
        return;
      }

      addSavedMessageId(messageId);
      try {
        await apiClient.createNote({
          content: trimmed,
          sourceMessageId: messageId,
        });
      } catch (e) {
        removeSavedMessageId(messageId);
        Alert.alert('Could not save note', e instanceof Error ? e.message : 'Try again');
        throw e;
      }
    },
    [addSavedMessageId, removeSavedMessageId]
  );
}
