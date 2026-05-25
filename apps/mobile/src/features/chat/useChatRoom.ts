import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage, ChatSessionKind } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';
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
    sessionToken: session?.session?.token,
    sessionId,
    enabled: Boolean(sessionId && session?.session?.token),
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
    } catch {
      // keep optimistic kind from route
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
