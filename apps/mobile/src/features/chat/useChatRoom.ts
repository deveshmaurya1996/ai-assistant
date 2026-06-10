import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { ChatAttachmentRef, ChatMessage, ChatSessionKind } from '@ai-assistant/sdk';
import type { ChatSendPayload } from '@/components/chat/ChatComposer';
import { apiClient } from '@/lib/api-client';
import { formatApiError } from '@/lib/format-ai-error';
import { useSavedNotesStore } from '@/features/notes/savedNotesStore';
import { useChatSocketStream } from './useChatSocketStream';
import { buildStreamingMessages } from './buildStreamingMessages';
import { useOverlaySessionStore } from '@/features/overlay/overlaySessionStore';
import { useChatSidebarStore } from './chatSidebarStore';
import { useChatStreamStore } from './chatStreamStore';
import {
  finishInPlacePromotion,
  useComposeDraftStore,
} from './chatSessionLifecycle';

type UseChatRoomOptions = {
  sessionId?: string | null;
  initialTitle?: string;
  initialKind?: string;
  isCompose?: boolean;
  onSessionCreated?: (sessionId: string) => void;
  onExchangeComplete?: (sessionId: string) => void;
};

export function useChatRoom({
  sessionId,
  initialTitle,
  initialKind,
  isCompose = false,
  onSessionCreated,
  onExchangeComplete,
}: UseChatRoomOptions) {
  const hasSessionId = Boolean(sessionId);
  const prevSessionIdRef = useRef<string | null | undefined>(sessionId);

  const [title, setTitle] = useState(initialTitle ?? (hasSessionId ? 'Chat' : 'New chat'));
  const [kind, setKind] = useState<ChatSessionKind>(
    initialKind === 'voice' ? 'voice' : 'text'
  );
  const isVoice = kind === 'voice';
  const savedMessageIds = useSavedNotesStore((s) => s.savedMessageIds);
  const setSavedMessageIds = useSavedNotesStore((s) => s.setSavedMessageIds);

  const loadGenerationRef = useRef(0);
  const loadSessionRef = useRef<(generation: number) => Promise<void>>(async () => {});
  const titleFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const clearTitleRefetch = useCallback(() => {
    if (titleFetchTimeoutRef.current) {
      clearTimeout(titleFetchTimeoutRef.current);
      titleFetchTimeoutRef.current = null;
    }
  }, []);

  const scheduleTitleRefetch = useCallback((targetSessionId: string) => {
    clearTitleRefetch();
    titleFetchTimeoutRef.current = setTimeout(() => {
      titleFetchTimeoutRef.current = null;
      void (async () => {
        try {
          const activeId =
            sessionIdRef.current ??
            useComposeDraftStore.getState().liveSessionId ??
            null;
          if (activeId !== targetSessionId) return;

          const chatSession = await apiClient.getChatSession(targetSessionId);
          if (!chatSession.title) return;
          const activeAfterFetch =
            sessionIdRef.current ??
            useComposeDraftStore.getState().liveSessionId ??
            null;
          if (activeAfterFetch !== targetSessionId) return;
          setTitle(chatSession.title);
          useOverlaySessionStore.getState().upsertSession(targetSessionId, {
            title: chatSession.title,
            kind: chatSession.kind === 'voice' ? 'voice' : 'text',
          });
          useChatSidebarStore.getState().patchTitle(
            targetSessionId,
            chatSession.title,
            chatSession.kind
          );
        } catch (err) {
          if (__DEV__) {
            console.warn('[useChatRoom] title refetch failed:', formatApiError(err), err);
          }
        }
      })();
    }, 2500);
  }, [clearTitleRefetch]);

  const {
    messages,
    setMessages,
    streamText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    isImageGenerating,
    streamStatusMessage,
    streamRevision,
    emitMessage,
    abortGeneration,
    resetStream,
  } = useChatSocketStream({
    sessionId: sessionId ?? null,
    onSessionCreated,
    onExchangeComplete: (id) => {
      if (useComposeDraftStore.getState().promotingInPlace) {
        finishInPlacePromotion();
        void loadSessionRef.current(loadGenerationRef.current);
      }
      scheduleTitleRefetch(id);
      onExchangeComplete?.(id);
    },
    onTitleUpdated: setTitle,
    onError: (message) => {
      Alert.alert('Message failed', message);
    },
  });

  const applyMessages = useCallback(
    (generation: number, data: ChatMessage[]) => {
      if (loadGenerationRef.current !== generation || !sessionId) return;

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
    },
    [sessionId, setMessages]
  );

  const loadSession = useCallback(
    async (generation: number) => {
      if (!sessionId || loadGenerationRef.current !== generation) return;

      try {
        const [chatSession, messageRows, savedIds] = await Promise.all([
          apiClient.getChatSession(sessionId),
          apiClient.getMessages(sessionId),
          apiClient.getSavedMessageIds(sessionId),
        ]);

        if (loadGenerationRef.current !== generation) return;

        setKind(chatSession.kind);
        if (chatSession.title) {
          setTitle(chatSession.title);
        } else if (initialTitle) {
          setTitle(initialTitle);
        }

        useOverlaySessionStore.getState().upsertSession(sessionId, {
          title: chatSession.title || 'Chat',
          kind: chatSession.kind === 'voice' ? 'voice' : 'text',
        });

        applyMessages(generation, messageRows);
        setSavedMessageIds(savedIds);
      } catch (err) {
        if (__DEV__ && loadGenerationRef.current === generation) {
          console.warn('[useChatRoom] loadSession failed:', formatApiError(err), err);
        }
      }
    },
    [sessionId, initialTitle, applyMessages, setSavedMessageIds]
  );

  loadSessionRef.current = loadSession;

  const reloadMessages = useCallback(async () => {
    if (!sessionId) return;
    const generation = loadGenerationRef.current;
    try {
      const data = await apiClient.getMessages(sessionId);
      applyMessages(generation, data);
    } catch (err) {
      if (__DEV__) {
        console.warn('[useChatRoom] reloadMessages failed:', formatApiError(err), err);
      }
    }
  }, [sessionId, applyMessages]);

  const reloadSavedIds = useCallback(async () => {
    if (!sessionId) return;
    const generation = loadGenerationRef.current;
    try {
      const ids = await apiClient.getSavedMessageIds(sessionId);
      if (loadGenerationRef.current === generation) {
        setSavedMessageIds(ids);
      }
    } catch (err) {
      if (__DEV__) {
        console.warn('[useChatRoom] reloadSavedIds failed:', formatApiError(err), err);
      }
    }
  }, [sessionId, setSavedMessageIds]);

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    const prevId = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;

    clearTitleRefetch();

    if (!sessionId) {
      setMessages([]);
      resetStream();
      setSavedMessageIds([]);
      if (isCompose) {
        setTitle(initialTitle ?? 'New chat');
      }
      return;
    }

    const isInPlacePromotion =
      isCompose &&
      !prevId &&
      sessionId &&
      useComposeDraftStore.getState().promotingInPlace;

    if (isInPlacePromotion) {
      return;
    }

    setKind(initialKind === 'voice' ? 'voice' : 'text');
    if (initialTitle) setTitle(initialTitle);

    setMessages([]);
    setSavedMessageIds([]);
    void loadSession(generation);
  }, [
    sessionId,
    initialKind,
    initialTitle,
    loadSession,
    resetStream,
    setMessages,
    setSavedMessageIds,
    isCompose,
    setTitle,
    clearTitleRefetch,
  ]);

  const skipNextFocusReloadRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!sessionId) return;
      if (skipNextFocusReloadRef.current) {
        skipNextFocusReloadRef.current = false;
        return;
      }
      void reloadMessages();
      void reloadSavedIds();
    }, [sessionId, reloadMessages, reloadSavedIds])
  );

  useEffect(() => {
    skipNextFocusReloadRef.current = true;
  }, [sessionId]);

  useEffect(() => clearTitleRefetch, [clearTitleRefetch]);

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
    streamText,
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
    visibleText: streamText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    isImageGenerating,
    streamStatusMessage,
    streamRevision,
    send,
    stopGeneration: abortGeneration,
    reloadMessages,
    savedMessageIds,
    setTitle,
  };
}
