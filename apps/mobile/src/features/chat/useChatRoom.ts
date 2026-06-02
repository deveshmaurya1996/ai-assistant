import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { ChatAttachmentRef, ChatMessage, ChatSessionKind } from '@ai-assistant/sdk';
import type { ChatSendPayload } from '@/components/chat/ChatComposer';
import { apiClient } from '@/lib/api-client';
import { formatApiError } from '@/lib/format-ai-error';
import { useSettingsStore } from '@/stores/settings';
import { useSavedNotesStore } from '@/features/notes/savedNotesStore';
import { useChatSocketStream } from './useChatSocketStream';
import { buildStreamingMessages } from './buildStreamingMessages';
import { useOverlaySessionStore } from '@/features/overlay/overlaySessionStore';
import { useChatStreamStore } from './chatStreamStore';

type UseChatRoomOptions = {
  sessionId?: string | null;
  initialTitle?: string;
  initialKind?: string;
  onSessionCreated?: (sessionId: string) => void;
  onExchangeComplete?: (sessionId: string) => void;
};

export function useChatRoom({
  sessionId,
  initialTitle,
  initialKind,
  onSessionCreated,
  onExchangeComplete,
}: UseChatRoomOptions) {
  const hasSessionId = Boolean(sessionId);

  const [title, setTitle] = useState(initialTitle ?? (hasSessionId ? 'Chat' : 'New chat'));
  const [kind, setKind] = useState<ChatSessionKind>(
    initialKind === 'voice' ? 'voice' : 'text'
  );
  const isVoice = kind === 'voice';
  const savedMessageIds = useSavedNotesStore((s) => s.savedMessageIds);
  const setSavedMessageIds = useSavedNotesStore((s) => s.setSavedMessageIds);

  const {
    messages,
    setMessages,
    visibleText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    emitMessage,
    abortGeneration,
  } = useChatSocketStream({
    sessionId: sessionId ?? null,
    onSessionCreated,
    onExchangeComplete,
    onTitleUpdated: setTitle,
    onError: (message) => {
      Alert.alert('Message failed', message);
    },
  });

  const refreshSessionMeta = useCallback(async () => {
    if (!sessionId) return;
    try {
      const chatSession = await apiClient.getChatSession(sessionId);
      setKind(chatSession.kind);
      if (chatSession.title) {
        setTitle(chatSession.title);
      }
      useOverlaySessionStore.getState().upsertSession(sessionId, {
        title: chatSession.title || 'Chat',
        kind: chatSession.kind === 'voice' ? 'voice' : 'text',
      });
    } catch (err) {
      // Keep optimistic title/kind from route when metadata refresh fails (offline, etc.)
      if (__DEV__) {
        console.warn('[useChatRoom] refreshSessionMeta failed:', formatApiError(err), err);
      }
    }
  }, [sessionId]);

  const loadMessages = useCallback(async () => {
    if (!sessionId) return;
    const data = await apiClient.getMessages(sessionId);
    const generating = useChatStreamStore.getState().isSessionGenerating(sessionId);
    if (!generating) {
      setMessages(data);
      return;
    }
    setMessages((prev) => {
      const pendingLocals = prev.filter(
        (m) =>
          m.id.startsWith('local-') &&
          !data.some((d) => d.role === m.role && d.content === m.content)
      );
      return [...data, ...pendingLocals];
    });
  }, [sessionId, setMessages]);

  const loadSavedMessageIds = useCallback(async () => {
    if (!sessionId) return;
    try {
      const ids = await apiClient.getSavedMessageIds(sessionId);
      setSavedMessageIds(ids);
    } catch (err) {
      if (__DEV__) {
        console.warn('[useChatRoom] loadSavedMessageIds failed:', formatApiError(err), err);
      }
    }
  }, [sessionId, setSavedMessageIds]);

  useEffect(() => {
    if (!sessionId) return;
    setKind(initialKind === 'voice' ? 'voice' : 'text');
    if (initialTitle) setTitle(initialTitle);
  }, [sessionId, initialKind, initialTitle]);

  useFocusEffect(
    useCallback(() => {
      if (!sessionId) return;
      void loadMessages();
      void refreshSessionMeta();
      void loadSavedMessageIds();
    }, [sessionId, loadMessages, refreshSessionMeta, loadSavedMessageIds])
  );

  const send = useCallback(
    (payload: ChatSendPayload) => {
      const trimmed = payload.text.trim();
      const attachments: ChatAttachmentRef[] = payload.attachments ?? [];
      if ((!trimmed && attachments.length === 0) || isGenerating) return false;

      const optimisticId = `local-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        role: 'USER',
        content: trimmed,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      setMessages((prev) => [...prev, optimistic]);
      const sent = emitMessage(trimmed, { attachments });
      if (!sent) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        Alert.alert(
          'Could not send',
          'Not connected or a reply is already in progress. Try again in a moment.'
        );
        return false;
      }
      return true;
    },
    [emitMessage, isGenerating, setMessages]
  );

  const displayMessages = buildStreamingMessages(
    messages,
    visibleText,
    isStreaming,
    isGenerating
  );

  return {
    title,
    kind,
    isVoice,
    isCompose: !hasSessionId,
    messages,
    displayMessages,
    visibleText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    send,
    stopGeneration: abortGeneration,
    loadMessages,
    refreshSessionMeta,
    savedMessageIds,
  };
}
