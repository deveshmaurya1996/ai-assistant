import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatSessionKind } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';
import { getSocketSessionToken } from '@/lib/auth-cookies';
import { formatApiError } from '@/lib/format-ai-error';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useSavedNotesStore } from '@/features/notes/savedNotesStore';
import { useChatSocketStream } from './useChatSocketStream';
import { buildStreamingMessages } from './buildStreamingMessages';

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
  const session = useAuthStore((s) => s.session);
  const sessionToken = session ? getSocketSessionToken() : undefined;
  const defaultRag = useSettingsStore((s) => s.defaultRagEnabled);
  const hasSessionId = Boolean(sessionId);
  const hadSessionOnMount = useRef(hasSessionId);

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
    isStreaming,
    isGenerating,
    emitMessage,
  } = useChatSocketStream({
    sessionToken,
    sessionId: sessionId ?? null,
    enabled: Boolean(sessionToken),
    onSessionCreated,
    onExchangeComplete,
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
      // Keep optimistic title/kind from route when metadata refresh fails (offline, etc.)
      if (__DEV__) {
        console.warn('[useChatRoom] refreshSessionMeta failed:', formatApiError(err), err);
      }
    }
  }, [sessionId]);

  const loadMessages = useCallback(async () => {
    if (!sessionId) return;
    const data = await apiClient.getMessages(sessionId);
    setMessages(data);
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

    if (!hadSessionOnMount.current) {
      hadSessionOnMount.current = true;
      void refreshSessionMeta();
      void loadSavedMessageIds();
      return;
    }

    void loadMessages();
    void refreshSessionMeta();
    void loadSavedMessageIds();
  }, [sessionId, initialKind, initialTitle, loadMessages, refreshSessionMeta, loadSavedMessageIds]);

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
    isCompose: !hasSessionId,
    messages,
    displayMessages,
    visibleText,
    isStreaming,
    isGenerating,
    send,
    loadMessages,
    refreshSessionMeta,
    savedMessageIds,
  };
}
