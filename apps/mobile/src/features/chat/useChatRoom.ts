import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { ChatMessage, ChatSessionKind } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';
import { getSocketSessionToken } from '@/lib/auth-cookies';
import { formatApiError } from '@/lib/format-ai-error';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useChatSocketStream } from './useChatSocketStream';
import { buildStreamingMessages } from './buildStreamingMessages';

type UseChatRoomOptions = {
  sessionId: string;
  initialTitle?: string;
  initialKind?: string;
};

export function useChatRoom({
  sessionId,
  initialTitle,
  initialKind,
}: UseChatRoomOptions) {
  const session = useAuthStore((s) => s.session);
  const sessionToken = session ? getSocketSessionToken() : undefined;
  const defaultRag = useSettingsStore((s) => s.defaultRagEnabled);

  const [title, setTitle] = useState(initialTitle ?? 'Chat');
  const [kind, setKind] = useState<ChatSessionKind>(
    initialKind === 'voice' ? 'voice' : 'text'
  );
  const isVoice = kind === 'voice';

  const {
    messages,
    setMessages,
    visibleText,
    isStreaming,
    isGenerating,
    emitMessage,
  } = useChatSocketStream({
    sessionToken,
    sessionId,
    enabled: Boolean(sessionId && sessionToken),
    onTitleUpdated: setTitle,
  });

  const refreshSessionMeta = useCallback(async () => {
    if (!sessionId) return;
    try {
      const chatSession = await apiClient.getChatSession(sessionId);
      setKind(chatSession.kind);
      if (chatSession.title) {
        setTitle(chatSession.title);
      }
    } catch (err) {
      const message = formatApiError(err);
      if (__DEV__) {
        console.warn('[useChatRoom] refreshSessionMeta failed:', message, err);
      }
      if (Platform.OS === 'web') {
        window.alert(`Could not load chat: ${message}`);
      } else {
        Alert.alert('Could not load chat', message);
      }
    }
  }, [sessionId]);

  const loadMessages = useCallback(async () => {
    if (!sessionId) return;
    const data = await apiClient.getMessages(sessionId);
    setMessages(data);
  }, [sessionId, setMessages]);

  useEffect(() => {
    if (!sessionId) return;

    setKind(initialKind === 'voice' ? 'voice' : 'text');
    if (initialTitle) setTitle(initialTitle);

    void loadMessages();
    void refreshSessionMeta();
  }, [sessionId, initialKind, initialTitle, loadMessages, refreshSessionMeta]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'USER',
        content: trimmed,
      };
      setMessages((prev) => [...prev, optimistic]);
      return emitMessage(trimmed, defaultRag);
    },
    [defaultRag, emitMessage, setMessages]
  );

  const displayMessages = buildStreamingMessages(messages, visibleText, isStreaming);

  return {
    title,
    kind,
    isVoice,
    messages,
    displayMessages,
    visibleText,
    isStreaming,
    isGenerating,
    send,
    loadMessages,
    refreshSessionMeta,
  };
}
