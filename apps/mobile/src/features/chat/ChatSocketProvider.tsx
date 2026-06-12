import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AssistantSocket, ChatMessage } from '@ai-assistant/sdk';
import type {
  ActionConfirmRequiredPayload,
  ChatAttachmentRef,
  ChatErrorPayload,
  ChatStatusPayload,
} from '@ai-assistant/types';
import { apiClient } from '@/lib/api-client';
import { formatChatSocketError } from '@/lib/format-ai-error';
import { useChatActionConfirmBridge } from './chatActionConfirmBridge';
import { useSettingsStore } from '@/stores/settings';
import { useOverlaySessionStore } from '@/features/overlay/overlaySessionStore';
import { useChatSidebarStore } from './chatSidebarStore';
import { syncSidebarAttention } from './sidebarAttention';
import {
  anyOtherSessionGenerating,
  PENDING_CHAT_STREAM_KEY,
  useChatStreamStore,
} from './chatStreamStore';
import { getComposeActiveSessionId } from './chatSessionLifecycle';
import { getDeviceTimezone } from '@/lib/deviceTimezone';

export type ChatSocketEmitOptions = {
  confirmed?: boolean;
  source?: 'chat' | 'voice';
  attachments?: ChatAttachmentRef[];
};

type SessionListeners = {
  onSessionCreated?: (sessionId: string) => void;
  onExchangeComplete?: (sessionId: string) => void;
  onTitleUpdated?: (title: string) => void;
  onStreamTargetChange?: (fullText: string) => void;
  onError?: (message: string) => void;
  onMessageSaved?: (message: ChatMessage) => void;
  onAssistantMessage?: (message: ChatMessage) => void;
  onAborted?: (sessionId: string) => void;
};

type ChatSocketContextValue = {
  socket: AssistantSocket | null;
  connected: boolean;
  emitMessage: (
    text: string,
    sessionId: string | null,
    opts?: ChatSocketEmitOptions
  ) => boolean;
  abortGeneration: (sessionId: string | null) => void;
  registerListeners: (listenerId: string, listeners: SessionListeners) => void;
  unregisterListeners: (listenerId: string) => void;
  setActiveSessionFilter: (listenerId: string, sessionId: string | null) => void;
};

const ChatSocketContext = createContext<ChatSocketContextValue | null>(null);

const TURN_TIMEOUT_MS = 25_000;
const CHUNK_STORE_FLUSH_MS = 80;

type ListenerEntry = {
  filterSessionId: string | null;
  listeners: SessionListeners;
};

export function ChatSocketProvider({
  children,
  sessionToken,
}: {
  children: ReactNode;
  sessionToken: string | undefined;
}) {
  const [socket, setSocket] = useState<AssistantSocket | null>(null);
  const socketRef = useRef<AssistantSocket | null>(null);
  const listenerMapRef = useRef(new Map<string, ListenerEntry>());
  const lastSentRef = useRef<{
    text: string;
    chatSessionId?: string;
    source?: 'chat' | 'voice';
    personalityId?: string;
    assistantDisplayName?: string;
  } | null>(null);
  const activeTurnSessionRef = useRef<string | null>(null);
  const turnTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const activeStreamKeyRef = useRef<string>(PENDING_CHAT_STREAM_KEY);
  const chunkBufferRef = useRef(new Map<string, string>());
  const chunkFlushRafRef = useRef<number | null>(null);
  const lastChunkStoreFlushRef = useRef(new Map<string, number>());

  const clearTurnTimeout = useCallback((sessionKey?: string) => {
    if (sessionKey) {
      const existing = turnTimeoutsRef.current.get(sessionKey);
      if (existing) {
        clearTimeout(existing);
        turnTimeoutsRef.current.delete(sessionKey);
      }
      return;
    }
    for (const timeout of turnTimeoutsRef.current.values()) {
      clearTimeout(timeout);
    }
    turnTimeoutsRef.current.clear();
  }, []);

  const clearActiveTurnIfMatches = useCallback((sessionId: string | null) => {
    if (activeTurnSessionRef.current === sessionId) {
      activeTurnSessionRef.current = null;
    }
  }, []);

  const beginTurn = useChatStreamStore((s) => s.beginTurn);
  const setStatusMessage = useChatStreamStore((s) => s.setStatusMessage);
  const appendChunk = useChatStreamStore((s) => s.appendChunk);
  const endTurn = useChatStreamStore((s) => s.endTurn);
  const abortTurn = useChatStreamStore((s) => s.abortTurn);
  const migratePendingToSession = useChatStreamStore((s) => s.migratePendingToSession);
  const setBoundTurnSessionId = useChatStreamStore((s) => s.setBoundTurnSessionId);

  const releaseBoundTurnIfIdle = useCallback((endedKey: string) => {
    const { boundTurnSessionId, setBoundTurnSessionId: releaseBound } =
      useChatStreamStore.getState();
    const endedSessionId =
      endedKey === PENDING_CHAT_STREAM_KEY ? null : endedKey;
    if (boundTurnSessionId !== endedSessionId) return;
    if (anyOtherSessionGenerating(endedKey)) return;
    releaseBound(null);
  }, []);

  const shouldNotifyListener = useCallback(
    (eventSessionId: string, filterSessionId: string | null) => {
      if (filterSessionId === eventSessionId) return true;
      if (filterSessionId !== null) return false;
      const turnSessionId = activeTurnSessionRef.current;
      return turnSessionId === eventSessionId;
    },
    []
  );

  const notifySessionEvent = useCallback(
    (eventSessionId: string, fn: (listeners: SessionListeners) => void) => {
      for (const entry of listenerMapRef.current.values()) {
        if (!shouldNotifyListener(eventSessionId, entry.filterSessionId)) continue;
        fn(entry.listeners);
      }
    },
    [shouldNotifyListener]
  );

  const notifyPendingOnly = useCallback((fn: (listeners: SessionListeners) => void) => {
    for (const entry of listenerMapRef.current.values()) {
      if (entry.filterSessionId !== null) continue;
      fn(entry.listeners);
    }
  }, []);

  const streamKeyForSession = useCallback((sessionId: string | null) => {
    return sessionId ?? PENDING_CHAT_STREAM_KEY;
  }, []);

  const bindIncomingStreamSession = useCallback(
    (incomingSessionId: string) => {
      if (activeStreamKeyRef.current !== PENDING_CHAT_STREAM_KEY) return;

      activeTurnSessionRef.current = activeTurnSessionRef.current ?? incomingSessionId;
      activeStreamKeyRef.current = incomingSessionId;

      const { boundTurnSessionId, sessions } = useChatStreamStore.getState();
      if (!boundTurnSessionId) {
        setBoundTurnSessionId(incomingSessionId);
      }
      if (sessions[PENDING_CHAT_STREAM_KEY]) {
        migratePendingToSession(incomingSessionId);
      }
    },
    [migratePendingToSession, setBoundTurnSessionId]
  );

  const resolveChunkStreamKey = useCallback(
    (incomingSessionId: string | null | undefined) => {
      if (incomingSessionId) {
        bindIncomingStreamSession(incomingSessionId);
        return incomingSessionId;
      }
      return activeStreamKeyRef.current;
    },
    [bindIncomingStreamSession]
  );

  const fireTurnTimeout = useCallback(
    (streamKey: string) => {
      const { sessions } = useChatStreamStore.getState();
      if (!sessions[streamKey]?.isGenerating) return;

      const sid = streamKey === PENDING_CHAT_STREAM_KEY ? null : streamKey;
      socketRef.current?.emit(
        'chat:abort',
        sid ? { chatSessionId: sid } : {}
      );
      abortTurn(streamKey);
      clearActiveTurnIfMatches(sid);
      releaseBoundTurnIfIdle(streamKey);

      const message =
        'Assistant is starting up — please try again in a moment.';
      if (sid) {
        notifySessionEvent(sid, (l) => l.onError?.(message));
      } else {
        notifyPendingOnly((l) => l.onError?.(message));
      }
    },
    [
      abortTurn,
      notifySessionEvent,
      notifyPendingOnly,
      releaseBoundTurnIfIdle,
      clearActiveTurnIfMatches,
    ]
  );

  const scheduleTurnTimeout = useCallback(
    (sessionKey: string) => {
      clearTurnTimeout(sessionKey);
      turnTimeoutsRef.current.set(
        sessionKey,
        setTimeout(() => {
          turnTimeoutsRef.current.delete(sessionKey);
          fireTurnTimeout(sessionKey);
        }, TURN_TIMEOUT_MS)
      );
    },
    [clearTurnTimeout, fireTurnTimeout]
  );

  const flushChunkBufferToStore = useCallback(
    (force = false) => {
      const buffer = chunkBufferRef.current;
      const now = Date.now();
      let hasRemainder = false;

      for (const [key, text] of buffer.entries()) {
        if (!text) continue;
        const last = lastChunkStoreFlushRef.current.get(key) ?? 0;
        if (!force && now - last < CHUNK_STORE_FLUSH_MS) {
          hasRemainder = true;
          continue;
        }
        appendChunk(key, text);
        buffer.set(key, '');
        lastChunkStoreFlushRef.current.set(key, now);
      }

      return hasRemainder;
    },
    [appendChunk]
  );

  const scheduleChunkFlush = useCallback(() => {
    if (chunkFlushRafRef.current != null) return;
    chunkFlushRafRef.current = requestAnimationFrame(() => {
      chunkFlushRafRef.current = null;
      if (flushChunkBufferToStore(false)) {
        scheduleChunkFlush();
      }
    });
  }, [flushChunkBufferToStore]);

  const forceFlushChunkBuffer = useCallback(() => {
    if (chunkFlushRafRef.current != null) {
      cancelAnimationFrame(chunkFlushRafRef.current);
      chunkFlushRafRef.current = null;
    }
    flushChunkBufferToStore(true);
  }, [flushChunkBufferToStore]);

  const queueChunk = useCallback(
    (sessionId: string | null | undefined, chunk: string) => {
      if (!chunk) return;
      const key = resolveChunkStreamKey(sessionId);
      const buffer = chunkBufferRef.current;
      buffer.set(key, (buffer.get(key) ?? '') + chunk);
      scheduleChunkFlush();
    },
    [scheduleChunkFlush, resolveChunkStreamKey]
  );

  useEffect(() => {
    if (!sessionToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      return;
    }

    let cancelled = false;
    let socket: AssistantSocket | null = null;

    void (async () => {
      const connected = await apiClient.connectSocket(sessionToken);
      if (cancelled) {
        connected.disconnect();
        return;
      }

      socket = connected;
      socketRef.current = connected;
      setSocket(connected);

      connected.on('chat:chunk', (data) => {
        const key = resolveChunkStreamKey(data.chatSessionId);
        scheduleTurnTimeout(key);
        queueChunk(data.chatSessionId, data.chunk);
      });

      connected.on('chat:status', (data: ChatStatusPayload) => {
        const key = resolveChunkStreamKey(data.chatSessionId);
        scheduleTurnTimeout(key);
        setStatusMessage(key, data.message);
      });

      connected.on('chat:message_saved', (data) => {
        const sid = activeTurnSessionRef.current;
        if (sid) {
          notifySessionEvent(sid, (l) => l.onMessageSaved?.(data.message));
        } else {
          notifyPendingOnly((l) => l.onMessageSaved?.(data.message));
        }
      });

      connected.on('chat:end', (data) => {
        if (chunkFlushRafRef.current != null) {
          cancelAnimationFrame(chunkFlushRafRef.current);
          chunkFlushRafRef.current = null;
        }
        forceFlushChunkBuffer();
        const sid = data.chatSessionId;
        clearTurnTimeout(sid);
        const hasContent = Boolean(data.message.content?.trim());
        const hasAttachments = Boolean(data.message.attachments?.length);
        if (!hasContent && !hasAttachments) {
          abortTurn(sid);
          notifySessionEvent(sid, (l) =>
            l.onError?.('The assistant returned an empty response. Please try again.')
          );
          clearActiveTurnIfMatches(sid);
          releaseBoundTurnIfIdle(sid);
          return;
        }
        endTurn(sid);
        syncSidebarAttention(sid);
        useOverlaySessionStore.getState().setLastReply(sid, data.message.content);
        if (data.modelLabel) {
          void useSettingsStore.getState().setLastAiModelLabel(data.modelLabel);
        }
        notifySessionEvent(sid, (l) => {
          l.onStreamTargetChange?.(data.message.content);
          l.onAssistantMessage?.(data.message);
          l.onExchangeComplete?.(sid);
        });
        clearActiveTurnIfMatches(sid);
        releaseBoundTurnIfIdle(sid);
      });

      connected.on('chat:aborted', (data) => {
        const sid = data.chatSessionId;
        clearTurnTimeout(sid);
        abortTurn(sid);
        notifySessionEvent(sid, (l) => l.onAborted?.(sid));
        clearActiveTurnIfMatches(sid);
        releaseBoundTurnIfIdle(sid);
      });

      connected.on('chat:error', (payload: ChatErrorPayload) => {
        const streamKey = payload.chatSessionId ?? PENDING_CHAT_STREAM_KEY;
        clearTurnTimeout(streamKey);
        const message = formatChatSocketError(payload);
        if (useChatStreamStore.getState().sessions[streamKey]?.isGenerating) {
          abortTurn(streamKey);
        }
        const sid = payload.chatSessionId ?? null;
        clearActiveTurnIfMatches(sid);
        if (sid) {
          notifySessionEvent(sid, (l) => l.onError?.(message));
        } else {
          notifyPendingOnly((l) => l.onError?.(message));
        }
        releaseBoundTurnIfIdle(streamKey);
      });

      connected.on('chat:title_updated', (data) => {
        useOverlaySessionStore.getState().setTitle(data.chatSessionId, data.title);
        useChatSidebarStore.getState().patchTitle(data.chatSessionId, data.title);
        notifySessionEvent(data.chatSessionId, (l) => l.onTitleUpdated?.(data.title));
        const composeSessionId = getComposeActiveSessionId();
        if (composeSessionId && composeSessionId === data.chatSessionId) {
          notifyPendingOnly((l) => l.onTitleUpdated?.(data.title));
        }
      });

      connected.on('chat:session_created', (data) => {
        activeTurnSessionRef.current = data.chatSessionId;
        activeStreamKeyRef.current = data.chatSessionId;
        setBoundTurnSessionId(data.chatSessionId);
        notifySessionEvent(data.chatSessionId, (l) =>
          l.onSessionCreated?.(data.chatSessionId)
        );
        migratePendingToSession(data.chatSessionId);
        useOverlaySessionStore.getState().upsertSession(data.chatSessionId, {
          title: 'New chat',
          kind: 'text',
        });
        useChatSidebarStore.getState().upsertSession({
          id: data.chatSessionId,
          title: 'New chat',
          kind: 'text',
          messageCount: 1,
        });
        syncSidebarAttention(data.chatSessionId);
      });

      connected.on('chat:action_confirm_required', (payload: ActionConfirmRequiredPayload) => {
        if (payload.tool.startsWith('whatsapp.')) {
          const { sessions } = useChatStreamStore.getState();
          for (const key of Object.keys(sessions)) {
            if (sessions[key]?.isGenerating) {
              abortTurn(key);
            }
          }
          return;
        }
        useChatActionConfirmBridge.getState().setPending(payload);
        const { sessions } = useChatStreamStore.getState();
        for (const key of Object.keys(sessions)) {
          if (sessions[key]?.isGenerating) {
            abortTurn(key);
          }
        }
      });
    })();

    return () => {
      cancelled = true;
      clearTurnTimeout();
      if (chunkFlushRafRef.current != null) {
        cancelAnimationFrame(chunkFlushRafRef.current);
        chunkFlushRafRef.current = null;
      }
      chunkBufferRef.current.clear();
      socket?.disconnect();
      socketRef.current = null;
      setSocket(null);
      useChatActionConfirmBridge.getState().registerHandlers(null);
    };
  }, [
    sessionToken,
    appendChunk,
    endTurn,
    abortTurn,
    migratePendingToSession,
    notifySessionEvent,
    notifyPendingOnly,
    setBoundTurnSessionId,
    resolveChunkStreamKey,
    queueChunk,
    forceFlushChunkBuffer,
    clearTurnTimeout,
    streamKeyForSession,
    setStatusMessage,
    releaseBoundTurnIfIdle,
    clearActiveTurnIfMatches,
  ]);

  const emitMessage = useCallback(
    (
      text: string,
      sessionId: string | null,
      opts?: ChatSocketEmitOptions
    ): boolean => {
      const trimmed = text.trim();
      const attachments = opts?.attachments ?? [];
      const socket = socketRef.current;
      if ((!trimmed && attachments.length === 0) || !socket?.connected) return false;

      const settings = useSettingsStore.getState();
      if (!settings.hydrated) {
        for (const entry of listenerMapRef.current.values()) {
          entry.listeners.onError?.('Settings still loading. Try again in a moment.');
        }
        return false;
      }

      const { selectedPersonalityId, assistantDisplayName } = settings;

      const sessionKey = streamKeyForSession(sessionId);
      const { sessions } = useChatStreamStore.getState();
      if (sessions[sessionKey]?.isGenerating) return false;

      activeTurnSessionRef.current = sessionId;
      activeStreamKeyRef.current = sessionKey;
      setBoundTurnSessionId(sessionId);
      useOverlaySessionStore.getState().setUserDismissed(false);
      if (sessionId) {
        useOverlaySessionStore.getState().clearLastReply(sessionId);
        useOverlaySessionStore.getState().upsertSession(sessionId, {
          kind: opts?.source === 'voice' ? 'voice' : 'text',
        });
      }
      beginTurn(sessionKey);
      if (sessionId) {
        syncSidebarAttention(sessionId);
      }
      scheduleTurnTimeout(sessionKey);
      useChatActionConfirmBridge.getState().setPending(null);

      const payload: {
        text: string;
        chatSessionId?: string;
        confirmed?: boolean;
        source?: 'chat' | 'voice';
        attachments?: ChatAttachmentRef[];
        personalityId?: string;
        assistantDisplayName?: string;
        timezone: string;
      } = {
        text: trimmed,
        source: opts?.source ?? 'chat',
        personalityId: selectedPersonalityId,
        assistantDisplayName,
        timezone: getDeviceTimezone(),
      };
      if (sessionId) payload.chatSessionId = sessionId;
      if (opts?.confirmed) payload.confirmed = true;
      if (attachments.length > 0) payload.attachments = attachments;

      lastSentRef.current = payload;

      useChatActionConfirmBridge.getState().registerHandlers({
        confirm: () => {
          const last = lastSentRef.current;
          if (!last || !socketRef.current) return;
          useChatActionConfirmBridge.getState().setPending(null);
          const key = streamKeyForSession(last.chatSessionId ?? null);
          activeStreamKeyRef.current = key;
          beginTurn(key);
          scheduleTurnTimeout(key);
          socketRef.current.emit('chat:message', { ...last, confirmed: true });
        },
        cancel: () => {
          useChatActionConfirmBridge.getState().setPending(null);
          const last = lastSentRef.current;
          const key = streamKeyForSession(last?.chatSessionId ?? null);
          abortTurn(key);
        },
      });

      socket.emit('chat:message', payload);
      return true;
    },
    [beginTurn, abortTurn, streamKeyForSession, scheduleTurnTimeout, setBoundTurnSessionId]
  );

  const abortGeneration = useCallback((sessionId: string | null) => {
    const sessionKey = streamKeyForSession(sessionId);
    const { sessions } = useChatStreamStore.getState();
    if (!sessions[sessionKey]?.isGenerating) return;

    clearTurnTimeout(sessionKey);
    socketRef.current?.emit(
      'chat:abort',
      sessionId ? { chatSessionId: sessionId } : {}
    );
    abortTurn(sessionKey);
    clearActiveTurnIfMatches(sessionId);
    releaseBoundTurnIfIdle(sessionKey);
  }, [
    abortTurn,
    streamKeyForSession,
    clearTurnTimeout,
    clearActiveTurnIfMatches,
    releaseBoundTurnIfIdle,
  ]);

  const registerListeners = useCallback(
    (listenerId: string, listeners: SessionListeners) => {
      listenerMapRef.current.set(listenerId, {
        filterSessionId: null,
        listeners,
      });
    },
    []
  );

  const unregisterListeners = useCallback((listenerId: string) => {
    listenerMapRef.current.delete(listenerId);
  }, []);

  const setActiveSessionFilter = useCallback(
    (listenerId: string, sessionId: string | null) => {
      const entry = listenerMapRef.current.get(listenerId);
      if (entry) {
        entry.filterSessionId = sessionId;
      }
    },
    []
  );

  const value = useMemo<ChatSocketContextValue>(
    () => ({
      socket,
      connected: Boolean(socket?.connected),
      emitMessage,
      abortGeneration,
      registerListeners,
      unregisterListeners,
      setActiveSessionFilter,
    }),
    [
      socket,
      emitMessage,
      abortGeneration,
      registerListeners,
      unregisterListeners,
      setActiveSessionFilter,
    ]
  );

  return (
    <ChatSocketContext.Provider value={value}>{children}</ChatSocketContext.Provider>
  );
}

export function useChatSocket(): ChatSocketContextValue {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) {
    throw new Error('useChatSocket must be used within ChatSocketProvider');
  }
  return ctx;
}
