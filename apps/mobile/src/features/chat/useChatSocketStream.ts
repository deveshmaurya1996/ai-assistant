import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantSocket, ChatMessage } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';
import { formatChatSocketError } from '@/lib/format-ai-error';
import { useChatActionConfirmBridge } from './chatActionConfirmBridge';
import { useStreamingDisplay } from './useStreamingDisplay';

type Options = {
  sessionToken: string | undefined;
  sessionId?: string | null;
  enabled?: boolean;
  onSessionCreated?: (sessionId: string) => void;
  onExchangeComplete?: (sessionId: string) => void;
  onTitleUpdated?: (title: string) => void;
  onStreamTargetChange?: (fullText: string) => void;
  onError?: (message: string) => void;
};

function matchesSession(
  eventSessionId: string,
  filterSessionId: string | null | undefined
): boolean {
  if (!filterSessionId) return true;
  return eventSessionId === filterSessionId;
}

export function useChatSocketStream({
  sessionToken,
  sessionId,
  enabled = true,
  onSessionCreated,
  onExchangeComplete,
  onTitleUpdated,
  onStreamTargetChange,
  onError,
}: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const socketRef = useRef<AssistantSocket | null>(null);
  const sessionIdRef = useRef(sessionId ?? null);
  const lastSentRef = useRef<{
    text: string;
    ragEnabled: boolean;
    chatSessionId?: string;
    source?: 'chat' | 'voice';
  } | null>(null);

  const stream = useStreamingDisplay();
  const streamRef = useRef(stream);
  streamRef.current = stream;

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
    sessionIdRef.current = sessionId ?? null;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionToken || !enabled) return;

    let socket: AssistantSocket | null = null;
    let cancelled = false;

    void (async () => {
      const connected = await apiClient.connectSocket(sessionToken);
      if (cancelled) {
        connected.disconnect();
        return;
      }
      socket = connected;
      socketRef.current = connected;

      connected.on('chat:chunk', (data) => {
        if (!matchesSession(data.chatSessionId, sessionIdRef.current)) return;
        const s = streamRef.current;
        s.appendChunk(data.chunk);
        setIsGenerating(true);
        onStreamTargetChangeRef.current?.(s.targetText());
      });

      connected.on('chat:message_saved', (data) => {
        setMessages((prev) => [...prev, data.message]);
      });

      connected.on('chat:end', (data) => {
        if (!matchesSession(data.chatSessionId, sessionIdRef.current)) return;
        streamRef.current.endStream();
        setMessages((prev) => [...prev, data.message]);
        streamRef.current.reset();
        setIsGenerating(false);
        onStreamTargetChangeRef.current?.(data.message.content);
        onExchangeCompleteRef.current?.(data.chatSessionId);
      });

      connected.on('chat:error', (payload) => {
        streamRef.current.reset();
        setIsGenerating(false);
        onErrorRef.current?.(formatChatSocketError(payload));
      });

      connected.on('chat:title_updated', (data) => {
        if (!matchesSession(data.chatSessionId, sessionIdRef.current)) return;
        onTitleUpdatedRef.current?.(data.title);
      });

      connected.on('chat:session_created', (data) => {
        sessionIdRef.current = data.chatSessionId;
        onSessionCreatedRef.current?.(data.chatSessionId);
      });

      connected.on('chat:action_confirm_required', (payload) => {
        if (payload.tool.startsWith('whatsapp.')) {
          setIsGenerating(false);
          return;
        }
        useChatActionConfirmBridge.getState().setPending(payload);
        setIsGenerating(false);
      });
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
      useChatActionConfirmBridge.getState().registerHandlers(null);
    };
  }, [sessionToken, enabled]);

  const emitMessage = useCallback(
    (text: string, ragEnabled: boolean, opts?: { confirmed?: boolean; source?: 'chat' | 'voice' }) => {
    if (!text.trim() || !socketRef.current) return false;

    streamRef.current.reset();
    setIsGenerating(true);
    useChatActionConfirmBridge.getState().setPending(null);

    const filterId = sessionIdRef.current;
    const payload: {
      text: string;
      ragEnabled: boolean;
      chatSessionId?: string;
      confirmed?: boolean;
      source?: 'chat' | 'voice';
    } = {
      text: text.trim(),
      ragEnabled,
      source: opts?.source ?? 'chat',
    };
    if (filterId) {
      payload.chatSessionId = filterId;
    }
    if (opts?.confirmed) payload.confirmed = true;

    lastSentRef.current = payload;
    useChatActionConfirmBridge.getState().registerHandlers({
      confirm: () => {
        const last = lastSentRef.current;
        if (!last || !socketRef.current) return;
        useChatActionConfirmBridge.getState().setPending(null);
        streamRef.current.reset();
        setIsGenerating(true);
        socketRef.current.emit('chat:message', {
          ...last,
          confirmed: true,
        });
      },
      cancel: () => {
        useChatActionConfirmBridge.getState().setPending(null);
        setIsGenerating(false);
      },
    });
    socketRef.current.emit('chat:message', payload);
    return true;
    },
    []
  );

  const beginStream = useCallback(() => {
    streamRef.current.reset();
    streamRef.current.beginStream();
    setIsGenerating(true);
  }, []);

  return {
    messages,
    setMessages,
    socketRef,
    visibleText: stream.visibleText,
    isStreaming: stream.isStreaming || isGenerating,
    isGenerating,
    streamTargetText: stream.targetText,
    appendChunk: stream.appendChunk,
    beginStream,
    resetStream: stream.reset,
    emitMessage,
    setIsGenerating,
  };
}
