import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AssistantSocket, ChatAttachmentRef, ChatMessage } from '@ai-assistant/sdk';
import { useChatSocket } from './ChatSocketProvider';
import {
  PENDING_CHAT_STREAM_KEY,
  selectSessionStream,
  useChatStreamStore,
} from './chatStreamStore';

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

  const streamKey = sessionId ?? PENDING_CHAT_STREAM_KEY;
  const streamText = useChatStreamStore(
    (s) => selectSessionStream(s.sessions, sessionId ?? null)?.streamText ?? ''
  );
  const isGenerating = useChatStreamStore(
    (s) => selectSessionStream(s.sessions, sessionId ?? null)?.isGenerating ?? false
  );
  const streamStatusMessage = useChatStreamStore(
    (s) => selectSessionStream(s.sessions, sessionId ?? null)?.statusMessage ?? null
  );

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
          const matchIdx = (() => {
            const savedIds = new Set(
              (message.attachments ?? []).map((a) => a.id)
            );
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
          })();
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
        clearTurn(streamKey);
        setMessages((prev) => [...prev, message]);
        onStreamTargetChangeRef.current?.(message.content);
      },
      onAborted: () => {
        lastNotifiedLenRef.current = 0;
        clearTurn(streamKey);
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
        clearTurn(streamKey);
        onErrorRef.current?.(message);
      },
    });

    return () => {
      chatSocket.unregisterListeners(listenerId);
    };
  }, [enabled, listenerId, chatSocket, clearTurn, streamKey]);

  useEffect(() => {
    if (!enabled) return;
    chatSocket.setActiveSessionFilter(listenerId, sessionId ?? null);
  }, [enabled, listenerId, sessionId, chatSocket]);

  const showStreamBubble = isGenerating || Boolean(streamText.trim());

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

  return {
    messages,
    setMessages,
    socketRef,
    streamText,
    /** @deprecated use streamText — kept for existing call sites */
    visibleText: streamText,
    isStreaming: showStreamBubble,
    isGenerating,
    streamStatusMessage,
    streamTurnKey,
    emitMessage,
    abortGeneration,
    beginStream,
    resetStream: () => {
      lastNotifiedLenRef.current = 0;
      clearTurn(streamKey);
    },
    setIsGenerating: () => {
      /* generation state lives in chatStreamStore */
    },
  };
}
