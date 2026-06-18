import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ChatMessage } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';
import { useChatSocketStream } from '@/features/chat/useChatSocketStream';
import { useChatSocket } from '@/features/chat/ChatSocketProvider';
import { buildStreamingMessages } from '@/features/chat/buildStreamingMessages';
import { useChatSidebarStore } from '@/features/chat/chatSidebarStore';
import { useOverlaySessionStore } from '@/features/overlay/overlaySessionStore';
import { useLiveKitVoiceSession } from '@/features/voice-live/useLiveKitVoiceSession';
import { useVoiceSessionBridge } from './voiceSessionBridge';
import { runWithVoiceSessionSlot } from './voiceSessionGuard';
import { AGENT_CONNECT_TIMEOUT_MS, deriveClientPhase } from './voicePhaseDerivation';
import { useSettingsStore } from '@/stores/settings';
import {
  hideOverlayPanel,
  startVoiceAssistantService,
  stopVoiceAssistantService,
} from '@/lib/overlay';

export type VoiceAssistantPhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'waiting_for_ai'
  | 'speaking'
  | 'stopping';



function hasUserMessage(messages: ChatMessage[], text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return messages.some((m) => m.role === 'USER' && m.content.trim() === trimmed);
}

export function useVoiceAssistantSession() {
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const selectedPersonalityId = useSettingsStore((s) => s.selectedPersonalityId);
  const registerHandlers = useVoiceSessionBridge((s) => s.registerHandlers);
  const setRuntime = useVoiceSessionBridge((s) => s.setRuntime);

  const chatSocket = useChatSocket();
  const socket = chatSocket.socket;

  const [phase, setPhase] = useState<VoiceAssistantPhase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [pendingUserText, setPendingUserText] = useState('');
  const [voiceStreamTurnKey, setVoiceStreamTurnKey] = useState(0);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentPhaseRef = useRef<VoiceAssistantPhase | null>(null);
  const sawAgentSignalRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const currentVersionRef = useRef<number>(0);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<VoiceAssistantPhase>('idle');
  const pendingMessageIdRef = useRef(0);

  const setAgentTranscript = useCallback((text: string) => {
    setLiveTranscript((prev) => {
      if (text && !prev) {
        setVoiceStreamTurnKey((k) => k + 1);
      }
      return text;
    });
  }, []);

  const setUserTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setPendingUserText('');
      return;
    }
    pendingMessageIdRef.current += 1;
    setPendingUserText(trimmed);
    setVoiceStreamTurnKey((k) => k + 1);
  }, []);

  const setAgentPhase = useCallback((next: VoiceAssistantPhase) => {
    if (next === 'connecting') {
      return;
    }
    sawAgentSignalRef.current = true;
    agentPhaseRef.current = next;
    setPhase(next);
  }, []);

  const liveKit = useLiveKitVoiceSession();
  const {
    messages,
    setMessages,
    visibleText,
    streamTurnKey: chatStreamTurnKey,
    streamRevision,
    isStreaming,
    isGenerating,
    resetStream,
  } = useChatSocketStream({ sessionId });

  const refreshMessages = useCallback(
    async (sid: string) => {
      try {
        const [msgs, session] = await Promise.all([
          apiClient.getMessages(sid),
          apiClient.getChatSession(sid).catch(() => null),
        ]);
        setMessages(msgs);
        const current = useChatSidebarStore.getState().sessions.find((s) => s.id === sid);
        const title = session?.title ?? current?.title ?? 'Voice chat';
        if (current || session) {
          useChatSidebarStore.getState().upsertSession({
            ...(current ?? { id: sid }),
            id: sid,
            title,
            kind: 'voice',
            messageCount: msgs.length,
            personalityId: session?.personalityId ?? current?.personalityId,
            assistantDisplayName:
              session?.assistantDisplayName ?? current?.assistantDisplayName,
          });
        }
        return msgs;
      } catch {
        return null;
      }
    },
    [setMessages]
  );

  const onMessagesTick = useCallback((tickValue?: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    if (tickValue) {
      const incomingVersion = Number(tickValue);
      if (!isNaN(incomingVersion)) {
        if (incomingVersion <= currentVersionRef.current) {
          // Already have this version or newer, skip
          return;
        }
        currentVersionRef.current = incomingVersion;
      }
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      syncTimeoutRef.current = null;
      void refreshMessages(sid);
    }, 300);
  }, [refreshMessages]);

  const stopSession = useCallback(async (reason = 'unknown') => {
    const currentPhase = phaseRef.current;
    if (currentPhase === 'idle' || currentPhase === 'stopping') return;

    setPhase('stopping');

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    currentVersionRef.current = 0;

    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }

    await liveKit.disconnect();
    await hideOverlayPanel();
    await stopVoiceAssistantService();

    agentPhaseRef.current = null;
    sawAgentSignalRef.current = false;
    setSessionId(null);
    sessionIdRef.current = null;
    setLiveTranscript('');
    setPendingUserText('');
    setPhase('idle');
  }, [liveKit]);

const startSession = useCallback(async () => {
  if (phaseRef.current !== 'idle') return;

  setError(null);
  agentPhaseRef.current = null;
  sawAgentSignalRef.current = false;
  setPhase('connecting');

  try {
    const info = await liveKit.connect({ personalityId: selectedPersonalityId });
    setSessionId(info.chatSessionId);
    sessionIdRef.current = info.chatSessionId;

    useChatSidebarStore.getState().upsertSession({
      id: info.chatSessionId,
      title: 'Voice chat',
      kind: 'voice',
      messageCount: 0,
      personalityId: selectedPersonalityId,
    });

    useOverlaySessionStore.getState().upsertSession(info.chatSessionId, {
      title: 'Voice chat',
      kind: 'voice',
    });

    await refreshMessages(info.chatSessionId);
    await startVoiceAssistantService();
  } catch (e) {
    setPhase('idle');
    setError(e instanceof Error ? e.message : 'Could not start voice session');
  }
}, [liveKit, refreshMessages, selectedPersonalityId]);

  const startSessionGuarded = useCallback(async () => {
    await runWithVoiceSessionSlot(null, startSession);
  }, [startSession]);

const resumeSession = useCallback(
  async (existingId: string) => {
    if (phaseRef.current !== 'idle') return;

    setError(null);
    agentPhaseRef.current = null;
    sawAgentSignalRef.current = false;
    setPhase('connecting');

    try {
      const info = await liveKit.connect({
        chatSessionId: existingId,
        personalityId: selectedPersonalityId,
      });

      setSessionId(info.chatSessionId);
      sessionIdRef.current = info.chatSessionId;
      await refreshMessages(info.chatSessionId);
      await startVoiceAssistantService();
    } catch (e) {
      setPhase('idle');
      setError(e instanceof Error ? e.message : 'Could not resume voice session');
    }
  },
  [liveKit, refreshMessages, selectedPersonalityId]
);

  const resumeSessionGuarded = useCallback(
    async (existingId: string) => {
      await runWithVoiceSessionSlot(existingId, () => resumeSession(existingId));
    },
    [resumeSession]
  );

  const isActive = phase !== 'idle' && phase !== 'stopping';

const mergedMessages = useMemo(() => {
  if (!pendingUserText || hasUserMessage(messages, pendingUserText)) {
    return messages;
  }

  return [
    ...messages,
    {
      id: `voice-pending-user-${pendingMessageIdRef.current}`,
      role: 'USER' as const,
      content: pendingUserText,
    },
  ];
}, [messages, pendingUserText]);

  const streamingText = liveTranscript || visibleText;
  const streamingActive =
    streamingText.length > 0 || phase === 'speaking' || phase === 'waiting_for_ai';
  const displayMessages = buildStreamingMessages(
    mergedMessages,
    streamingText,
    streamingActive,
    phase === 'waiting_for_ai' || isGenerating
  );
  const streamTurnKey = voiceStreamTurnKey + chatStreamTurnKey;

  useEffect(() => {
  phaseRef.current = phase;
}, [phase]);

  useEffect(() => {
    if (!pendingUserText) return;
    if (hasUserMessage(messages, pendingUserText)) {
      setPendingUserText('');
    }
  }, [messages, pendingUserText]);

  useEffect(() => {
    if (!liveTranscript) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'ASSISTANT');
    if (!lastAssistant?.content) return;
    const live = liveTranscript.trim();
    const saved = lastAssistant.content.trim();
    if (saved === live || saved.includes(live) || live.includes(saved)) {
      setLiveTranscript('');
    }
  }, [messages, liveTranscript]);

  useEffect(() => {
    if (!sessionId || !isActive) return;
    void refreshMessages(sessionId);
  }, [isActive, refreshMessages, sessionId]);

  useEffect(() => {
    setRuntime({ phase, isActive, chatSessionId: sessionId });
  }, [phase, isActive, sessionId, setRuntime]);

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      const sid = sessionIdRef.current;
      if (sid) {
        void refreshMessages(sid);
      }
    };

    if (socket.connected) {
      const sid = sessionIdRef.current;
      if (sid) {
        void refreshMessages(sid);
      }
    }

    socket.on('connect', handleConnect);
    return () => {
      socket.off('connect', handleConnect);
    };
  }, [socket, refreshMessages]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const sid = sessionIdRef.current;
        if (sid) {
          void refreshMessages(sid);
        }
      }
    });
    return () => sub.remove();
  }, [refreshMessages]);

  // Clean up sync timeouts on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    registerHandlers({
      start: startSession,
      stop: () => stopSession(),
    });
    return () => {
      registerHandlers(null);
    };
  }, [registerHandlers, startSession, stopSession]);

  useEffect(() => {
    if (!isActive || !liveKit.tokenInfo) return;
    if (!sawAgentSignalRef.current) return;

    const next = deriveClientPhase({
      isActive,
      sawAgentSignal: sawAgentSignalRef.current,
      isStreaming,
      isGenerating,
      agentPhase: agentPhaseRef.current,
      currentPhase: phase,
    });
    if (next) setPhase(next);
  }, [isActive, isGenerating, isStreaming, liveKit.tokenInfo, phase]);

useEffect(() => {
  if (!isActive || !liveKit.tokenInfo) return;
  if (sawAgentSignalRef.current) return;

  if (connectTimeoutRef.current) {
    clearTimeout(connectTimeoutRef.current);
  }

  connectTimeoutRef.current = setTimeout(() => {
    if (sawAgentSignalRef.current) return;

    setError(
      'Voice agent did not join in time. Keep voice-gateway running and try Start again.'
    );

    agentPhaseRef.current = null;
    sawAgentSignalRef.current = false;
    setPhase('idle');
    setLiveTranscript('');
    setPendingUserText('');
    setSessionId(null);
    sessionIdRef.current = null;

    void liveKit.disconnect();
  }, AGENT_CONNECT_TIMEOUT_MS);

  return () => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  };
}, [isActive, liveKit, liveKit.tokenInfo]);

  return {
    phase,
    sessionId,
    error,
    messages: displayMessages,
    visibleText: streamingText,
    streamTurnKey,
    streamRevision,
    isStreaming: streamingActive,
    isGenerating: phase === 'waiting_for_ai' || isGenerating,
    isActive,
    startSession: startSessionGuarded,
    resumeSession: resumeSessionGuarded,
    stopSession,
    resetStream,
    setAgentPhase,
    setAgentTranscript,
    setUserTranscript,
    onMessagesTick,
    assistantDisplayName,
    liveKitToken: liveKit.tokenInfo,
  };
}

export type { ChatMessage };
