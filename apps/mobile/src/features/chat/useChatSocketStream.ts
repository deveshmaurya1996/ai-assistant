import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AssistantSocket, ChatAttachmentRef, ChatMessage } from '@ai-assistant/sdk';
import { useChatSocket } from './ChatSocketProvider';
import {
  PENDING_CHAT_STREAM_KEY,
  resolveStreamSessionKey,
  useChatStreamStore,
} from './chatStreamStore';
import { useChatStreamState } from './useChatStreamState';
import { useComposeDraftStore } from './chatSessionLifecycle';

type Options = {
  sessionId?: string | null;
  enabled?: boolean;
  onSessionCreated?: (sessionId: string) => void;
  onExchangeComplete?: (sessionId: string) => void;
  onTitleUpdated?: (title: string) => void;
  onStreamTargetChange?: (fullText: string) => void;
  onError?: (message: string) => void;
};

export function useChatSocketStream({
  sessionId,
  enabled = true,
  onSessionCreated,
  onExchangeComplete,
  onTitleUpdated,
  onStreamTargetChange,
  onError,
}: Options) {
  const listenerId = useId();
  const chatSocket = useChatSocket();
  const clearTurn = useChatStreamStore((s) => s.clearTurn);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamTurnKey, setStreamTurnKey] = useState(0);
  const socketRef = useRef<AssistantSocket | null>(null);
  const lastNotifiedLenRef = useRef(0);

  const {
    streamKey,
    streamText,
    isGenerating,
    streamStatusMessage,
    revision: streamRevision,
    showStreamBubble: isStreaming,
  } = useChatStreamState(sessionId);

  const onSessionCreatedRef = useRef(onSessionCreated);
  const onExchangeCompleteRef = useRef(onExchangeComplete);
  const onTitleUpdatedRef = useRef(onTitleUpdated);
  const onStreamTargetChangeRef = useRef(onStreamTargetChange);
  const onErrorRef = useRef(onError);
  onSessionCreatedRef.current = onSessionCreated;
  onExchangeCompleteRef.current = onExchangeComplete;
  onTitleUpdatedRef.current = onTitleUpdated;
  onStreamTargetChangeRef.current = onStreamTargetChange;
  onErrorRef.current = onError;

  useEffect(() => {
    socketRef.current = chatSocket.socket;
  }, [chatSocket.socket]);

  useEffect(() => {
    if (streamText.length > lastNotifiedLenRef.current) {
      lastNotifiedLenRef.current = streamText.length;
      onStreamTargetChangeRef.current?.(streamText);
    }
    if (!streamText.length && !isGenerating) {
      lastNotifiedLenRef.current = 0;
    }
  }, [streamText, isGenerating]);

  useEffect(() => {
    if (!enabled) return;

    chatSocket.registerListeners(listenerId, {
      onMessageSaved: (message) => {
        setMessages((prev) => {
          if (message.role !== 'USER') {
            return [...prev, message];
          }
          const matchIdx = findMatchingLocalUserIndex(prev, message);
          if (matchIdx < 0) {
            return [...prev, message];
          }
          const next = [...prev];
          next[matchIdx] = message;
          return next;
        });
      },
      onAssistantMessage: (message) => {
        lastNotifiedLenRef.current = 0;
        const key = resolveStreamSessionKey(
          sessionId,
          useChatStreamStore.getState().boundTurnSessionId
        );
        clearTurn(key);
        setMessages((prev) => [...prev, message]);
        onStreamTargetChangeRef.current?.(message.content);
      },
      onAborted: () => {
        lastNotifiedLenRef.current = 0;
        const key = resolveStreamSessionKey(
          sessionId,
          useChatStreamStore.getState().boundTurnSessionId
        );
        clearTurn(key);
      },
      onSessionCreated: (id) => {
        onSessionCreatedRef.current?.(id);
      },
      onExchangeComplete: (id) => {
        onExchangeCompleteRef.current?.(id);
      },
      onTitleUpdated: (title) => {
        onTitleUpdatedRef.current?.(title);
      },
      onStreamTargetChange: (fullText) => {
        onStreamTargetChangeRef.current?.(fullText);
      },
      onError: (message) => {
        lastNotifiedLenRef.current = 0;
        const key = resolveStreamSessionKey(
          sessionId,
          useChatStreamStore.getState().boundTurnSessionId
        );
        clearTurn(key);
        onErrorRef.current?.(message);
      },
    });

    return () => {
      chatSocket.unregisterListeners(listenerId);
    };
  }, [enabled, listenerId, chatSocket, clearTurn, sessionId]);

  useEffect(() => {
    if (!enabled) return;
    chatSocket.setActiveSessionFilter(listenerId, sessionId ?? null);
  }, [enabled, listenerId, sessionId, chatSocket]);

  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return;

    const wasDraft = prevSessionIdRef.current == null && sessionId != null;
    const promotingInPlace = useComposeDraftStore.getState().promotingInPlace;

    const prevBound = useChatStreamStore.getState().boundTurnSessionId;
    const prevKey = resolveStreamSessionKey(prevSessionIdRef.current, prevBound);
    prevSessionIdRef.current = sessionId;
    lastNotifiedLenRef.current = 0;
    setStreamTurnKey((k) => k + 1);

    if (wasDraft && promotingInPlace) {
      return;
    }

    const nextKey = resolveStreamSessionKey(
      sessionId,
      useChatStreamStore.getState().boundTurnSessionId
    );
    if (prevKey !== nextKey) {
      clearTurn(prevKey);
    }
  }, [sessionId, clearTurn]);

  const abortGeneration = useCallback(() => {
    if (!isGenerating) return;
    chatSocket.abortGeneration(sessionId ?? null);
    lastNotifiedLenRef.current = 0;
    clearTurn(streamKey);
  }, [chatSocket, sessionId, isGenerating, clearTurn, streamKey]);

  const emitMessage = useCallback(
    (
      text: string,
      opts?: {
        confirmed?: boolean;
        source?: 'chat' | 'voice';
        attachments?: ChatAttachmentRef[];
      }
    ) => {
      const trimmed = text.trim();
      const attachments = opts?.attachments ?? [];
      if ((!trimmed && attachments.length === 0) || isGenerating) return false;
      lastNotifiedLenRef.current = 0;
      setStreamTurnKey((k) => k + 1);
      return chatSocket.emitMessage(trimmed, sessionId ?? null, opts);
    },
    [chatSocket, sessionId, isGenerating]
  );

  const beginStream = useCallback(() => {
    lastNotifiedLenRef.current = 0;
    setStreamTurnKey((k) => k + 1);
  }, []);

  const resetStream = useCallback(() => {
    lastNotifiedLenRef.current = 0;
    clearTurn(streamKey);
  }, [clearTurn, streamKey]);

  return {
    messages,
    setMessages,
    socketRef,
    streamText,
    visibleText: streamText,
    isStreaming,
    isGenerating,
    streamStatusMessage,
    streamRevision,
    streamTurnKey,
    emitMessage,
    abortGeneration,
    beginStream,
    resetStream,
  };
}

function findMatchingLocalUserIndex(
  prev: ChatMessage[],
  message: ChatMessage
): number {
  const savedIds = new Set((message.attachments ?? []).map((a) => a.id));
  for (let i = prev.length - 1; i >= 0; i -= 1) {
    const m = prev[i];
    if (!m.id.startsWith('local-') || m.role !== 'USER') continue;
    if (m.content !== message.content) continue;
    const localIds = new Set((m.attachments ?? []).map((a) => a.id));
    if (savedIds.size !== localIds.size) continue;
    if ([...savedIds].every((id) => localIds.has(id))) return i;
  }
  for (let i = prev.length - 1; i >= 0; i -= 1) {
    const m = prev[i];
    if (m.id.startsWith('local-') && m.role === 'USER') return i;
  }
  return -1;
}
