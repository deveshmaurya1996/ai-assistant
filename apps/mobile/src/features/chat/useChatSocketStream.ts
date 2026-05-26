import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantSocket, ChatMessage } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';
import { formatChatSocketError } from '@/lib/format-ai-error';
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
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [sessionToken, enabled]);

  const emitMessage = useCallback((text: string, ragEnabled: boolean) => {
    if (!text.trim() || !socketRef.current) return false;

    streamRef.current.reset();
    setIsGenerating(true);

    const filterId = sessionIdRef.current;
    const payload: {
      text: string;
      ragEnabled: boolean;
      chatSessionId?: string;
    } = {
      text: text.trim(),
      ragEnabled,
    };
    if (filterId) {
      payload.chatSessionId = filterId;
    }

    socketRef.current.emit('chat:message', payload);
    return true;
  }, []);

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
