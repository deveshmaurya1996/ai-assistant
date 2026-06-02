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
import type { ActionConfirmRequiredPayload, ChatAttachmentRef } from '@ai-assistant/types';
import { apiClient } from '@/lib/api-client';
import { formatChatSocketError } from '@/lib/format-ai-error';
import { useChatActionConfirmBridge } from './chatActionConfirmBridge';
import { useSettingsStore } from '@/stores/settings';
import { useOverlaySessionStore } from '@/features/overlay/overlaySessionStore';
import {
  PENDING_CHAT_STREAM_KEY,
  useChatStreamStore,
} from './chatStreamStore';

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

const TURN_TIMEOUT_MS = 130_000;

function matchesSession(
  eventSessionId: string,
  filterSessionId: string | null | undefined
): boolean {
  if (!filterSessionId) return true;
  return eventSessionId === filterSessionId;
}

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
  const turnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeStreamKeyRef = useRef<string>(PENDING_CHAT_STREAM_KEY);

  const clearTurnTimeout = useCallback(() => {
    if (turnTimeoutRef.current) {
      clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }
  }, []);

  const beginTurn = useChatStreamStore((s) => s.beginTurn);
  const appendChunk = useChatStreamStore((s) => s.appendChunk);
  const endTurn = useChatStreamStore((s) => s.endTurn);
  const abortTurn = useChatStreamStore((s) => s.abortTurn);
  const migratePendingToSession = useChatStreamStore((s) => s.migratePendingToSession);

  const notifyMatching = useCallback(
    (
      eventSessionId: string,
      fn: (listeners: SessionListeners) => void
    ) => {
      for (const entry of listenerMapRef.current.values()) {
        if (!matchesSession(eventSessionId, entry.filterSessionId)) continue;
        fn(entry.listeners);
      }
    },
    []
  );

  const streamKeyForSession = useCallback((sessionId: string | null) => {
    return sessionId ?? PENDING_CHAT_STREAM_KEY;
  }, []);

  const fireTurnTimeout = useCallback(() => {
    const streamKey = activeStreamKeyRef.current;
    const { sessions } = useChatStreamStore.getState();
    if (!sessions[streamKey]?.isGenerating) return;

    const sid = activeTurnSessionRef.current;
    abortTurn(streamKey);
    activeTurnSessionRef.current = null;

    const message =
      'Request timed out. Check that AI services are running and try again.';
    if (sid) {
      notifyMatching(sid, (l) => l.onError?.(message));
    } else {
      for (const entry of listenerMapRef.current.values()) {
        entry.listeners.onError?.(message);
      }
    }
  }, [abortTurn, notifyMatching]);

  const scheduleTurnTimeout = useCallback(() => {
    clearTurnTimeout();
    turnTimeoutRef.current = setTimeout(() => {
      fireTurnTimeout();
    }, TURN_TIMEOUT_MS);
  }, [clearTurnTimeout, fireTurnTimeout]);

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
        appendChunk(data.chatSessionId, data.chunk);
      });

      connected.on('chat:message_saved', (data) => {
        const sid = activeTurnSessionRef.current;
        if (sid) {
          notifyMatching(sid, (l) => l.onMessageSaved?.(data.message));
        } else {
          for (const entry of listenerMapRef.current.values()) {
            entry.listeners.onMessageSaved?.(data.message);
          }
        }
      });

      connected.on('chat:end', (data) => {
        clearTurnTimeout();
        activeTurnSessionRef.current = data.chatSessionId;
        endTurn(data.chatSessionId);
        useOverlaySessionStore
          .getState()
          .setLastReply(data.chatSessionId, data.message.content);
        if (data.modelLabel) {
          void useSettingsStore.getState().setLastAiModelLabel(data.modelLabel);
        }
        notifyMatching(data.chatSessionId, (l) => {
          l.onStreamTargetChange?.(data.message.content);
          l.onAssistantMessage?.(data.message);
          l.onExchangeComplete?.(data.chatSessionId);
        });
        activeTurnSessionRef.current = null;
      });

      connected.on('chat:aborted', (data) => {
        clearTurnTimeout();
        abortTurn(data.chatSessionId);
        notifyMatching(data.chatSessionId, (l) => l.onAborted?.(data.chatSessionId));
        activeTurnSessionRef.current = null;
      });

      connected.on('chat:error', (payload) => {
        clearTurnTimeout();
        const message = formatChatSocketError(payload);
        const { sessions } = useChatStreamStore.getState();
        for (const key of Object.keys(sessions)) {
          if (sessions[key]?.isGenerating) {
            abortTurn(key);
          }
        }
        const sid = activeTurnSessionRef.current;
        activeTurnSessionRef.current = null;
        if (sid) {
          notifyMatching(sid, (l) => l.onError?.(message));
        } else {
          for (const entry of listenerMapRef.current.values()) {
            entry.listeners.onError?.(message);
          }
        }
      });

      connected.on('chat:title_updated', (data) => {
        useOverlaySessionStore.getState().setTitle(data.chatSessionId, data.title);
        notifyMatching(data.chatSessionId, (l) => l.onTitleUpdated?.(data.title));
      });

      connected.on('chat:session_created', (data) => {
        activeTurnSessionRef.current = data.chatSessionId;
        activeStreamKeyRef.current = data.chatSessionId;
        migratePendingToSession(data.chatSessionId);
        useOverlaySessionStore.getState().upsertSession(data.chatSessionId, {
          title: 'New chat',
          kind: 'text',
        });
        notifyMatching(data.chatSessionId, (l) =>
          l.onSessionCreated?.(data.chatSessionId)
        );
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
    notifyMatching,
    clearTurnTimeout,
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

      const {
        selectedPersonalityId,
        assistantDisplayName,
      } = useSettingsStore.getState();

      const sessionKey = streamKeyForSession(sessionId);
      const { sessions } = useChatStreamStore.getState();
      if (sessions[sessionKey]?.isGenerating) return false;

      activeTurnSessionRef.current = sessionId;
      activeStreamKeyRef.current = sessionKey;
      useOverlaySessionStore.getState().setUserDismissed(false);
      if (sessionId) {
        useOverlaySessionStore.getState().clearLastReply(sessionId);
        useOverlaySessionStore.getState().upsertSession(sessionId, {
          kind: opts?.source === 'voice' ? 'voice' : 'text',
        });
      }
      beginTurn(sessionKey);
      scheduleTurnTimeout();
      useChatActionConfirmBridge.getState().setPending(null);

      const payload: {
        text: string;
        chatSessionId?: string;
        confirmed?: boolean;
        source?: 'chat' | 'voice';
        attachments?: ChatAttachmentRef[];
        personalityId?: string;
        assistantDisplayName?: string;
      } = {
        text: trimmed,
        source: opts?.source ?? 'chat',
        personalityId: selectedPersonalityId,
        assistantDisplayName,
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
          scheduleTurnTimeout();
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
    [beginTurn, abortTurn, streamKeyForSession, scheduleTurnTimeout]
  );

  const abortGeneration = useCallback((sessionId: string | null) => {
    const sessionKey = streamKeyForSession(sessionId);
    const { sessions } = useChatStreamStore.getState();
    if (!sessions[sessionKey]?.isGenerating) return;

    clearTurnTimeout();
    socketRef.current?.emit(
      'chat:abort',
      sessionId ? { chatSessionId: sessionId } : {}
    );
    abortTurn(sessionKey);
    activeTurnSessionRef.current = null;
  }, [abortTurn, streamKeyForSession, clearTurnTimeout]);

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
