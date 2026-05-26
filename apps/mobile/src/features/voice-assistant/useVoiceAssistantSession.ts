import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantSocket, ChatChunkPayload, ChatMessage } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';
import { getSocketSessionToken } from '@/lib/auth-cookies';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { formatChatStepError, formatUserVoiceError } from '@/lib/format-ai-error';
import { SentenceTtsQueue, stopSpeechPlayback } from '@/lib/voice-playback';
import {
  hideOverlayPanel,
  startVoiceAssistantService,
  stopVoiceAssistantService,
} from '@/lib/overlay';
import { useVoiceTurnRecorder } from './useVoiceTurnRecorder';
import { useChatSocketStream } from '@/features/chat/useChatSocketStream';
import { buildStreamingMessages } from '@/features/chat/buildStreamingMessages';
import { useVoiceOverlaySync } from './useVoiceOverlaySync';
import { useVoiceTurnSocket } from './useVoiceTurnSocket';
import { useVoiceSessionBridge } from './voiceSessionBridge';
import { useStudioVoiceAnalysis } from '@/features/voice/studio/useStudioVoiceAnalysis';

export type VoiceAssistantPhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'waiting_for_ai'
  | 'speaking'
  | 'stopping';

const POST_SPEECH_DELAY_MS = 150;
const MAX_IDLE_TURNS = 2;
const SESSION_IDLE_MS = 60_000;
const IDLE_END_MESSAGE = 'Voice chat ended — no speech detected';

type StopSessionOptions = {
  idleMessage?: string;
};

export function useVoiceAssistantSession() {
  const session = useAuthStore((s) => s.session);
  const sessionToken = session ? getSocketSessionToken() : undefined;
  const defaultRag = useSettingsStore((s) => s.defaultRagEnabled);
  const assistantContinuousListening = useSettingsStore(
    (s) => s.assistantContinuousListening
  );
  const speakRepliesEnabled = useSettingsStore((s) => s.speakRepliesEnabled);
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const registerHandlers = useVoiceSessionBridge((s) => s.registerHandlers);
  const setRuntime = useVoiceSessionBridge((s) => s.setRuntime);

  const [phase, setPhase] = useState<VoiceAssistantPhase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stoppedRef = useRef(true);
  const loopRunningRef = useRef(false);
  const latestAssistantRef = useRef('');
  const ttsQueueRef = useRef<SentenceTtsQueue | null>(null);
  const streamedCharsRef = useRef(0);
  const consecutiveIdleTurnsRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const stopSessionRef = useRef<(opts?: StopSessionOptions) => Promise<void>>(async () => {});

  const { recordUntilSilence, cancelRecording } = useVoiceTurnRecorder();

  const isListening = phase === 'listening';
  const {
    meteringLevel,
    meteringDecibels,
    dataPoints: meteringDataPoints,
    isSpeechDetected: speechDetected,
  } = useStudioVoiceAnalysis(isListening);

  const {
    messages,
    setMessages,
    socketRef,
    visibleText,
    emitMessage,
    isStreaming,
    resetStream,
    setIsGenerating,
    isGenerating,
  } = useChatSocketStream({
    sessionToken,
    sessionId,
    enabled: Boolean(sessionToken),
    onStreamTargetChange: (fullText) => {
      latestAssistantRef.current = fullText;
      lastActivityRef.current = Date.now();
    },
    onError: (message) => {
      if (!stoppedRef.current) {
        setError(message);
        setPhase('idle');
        loopRunningRef.current = false;
        stoppedRef.current = true;
      }
    },
  });

  const { transcribeViaSocket, attachListeners } = useVoiceTurnSocket(socketRef);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const ensureVoiceSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;

    const session = await apiClient.createSession({
      title: `Voice chat with ${assistantDisplayName}`,
      kind: 'voice',
    });
    sessionIdRef.current = session.id;
    setSessionId(session.id);
    return session.id;
  }, [assistantDisplayName]);

  useEffect(() => {
    if (!sessionToken) return;
    let detach: (() => void) | undefined;
    const poll = setInterval(() => {
      const socket = socketRef.current;
      if (socket?.connected && !detach) {
        detach = attachListeners(socket);
        clearInterval(poll);
      }
    }, 250);
    return () => clearInterval(poll);
  }, [sessionToken, attachListeners, socketRef]);

  useVoiceOverlaySync({
    phase,
    sessionActive: phase !== 'idle' && phase !== 'stopping',
    assistantText: latestAssistantRef.current || visibleText,
    assistantDisplayName,
  });

  const stopSession = useCallback(
    async (opts?: StopSessionOptions) => {
      if (phase === 'idle' || phase === 'stopping') return;

      setPhase('stopping');
      stoppedRef.current = true;
      loopRunningRef.current = false;

      await cancelRecording();
      await ttsQueueRef.current?.abort();
      await stopSpeechPlayback();
      await hideOverlayPanel();
      await stopVoiceAssistantService();

      resetStream();

      const sid = sessionIdRef.current;
      if (sid) {
        try {
          const msgs = await apiClient.getMessages(sid);
          if (msgs.length === 0) {
            await apiClient.deleteSession(sid);
          }
        } catch (deleteErr) {
          if (__DEV__) {
            console.warn('[voice] delete empty session failed:', deleteErr);
          }
        }
      }
      sessionIdRef.current = null;
      setSessionId(null);

      if (opts?.idleMessage) {
        setError(opts.idleMessage);
      }
      setPhase('idle');
    },
    [cancelRecording, phase, resetStream]
  );

  useEffect(() => {
    stopSessionRef.current = stopSession;
  }, [stopSession]);

  useEffect(() => {
    if (phase === 'idle' || phase === 'stopping') return;
    if (assistantContinuousListening) return;

    const timer = setInterval(() => {
      if (stoppedRef.current || loopRunningRef.current === false) return;
      if (Date.now() - lastActivityRef.current >= SESSION_IDLE_MS) {
        void stopSessionRef.current({
          idleMessage: 'Voice chat ended — inactive',
        });
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [phase, assistantContinuousListening]);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    consecutiveIdleTurnsRef.current = 0;
  }, []);

  const waitForAssistantReply = useCallback(
    (sid: string) =>
      new Promise<ChatMessage>((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket) {
          reject(new Error('Socket not connected'));
          return;
        }

        const onEnd = (data: { message: ChatMessage; chatSessionId: string }) => {
          if (data.chatSessionId !== sid) return;
          socket.off('chat:end', onEnd);
          socket.off('chat:error', onError);
          resolve(data.message);
        };

        const onError = (payload: { error?: string; details?: string }) => {
          socket.off('chat:end', onEnd);
          socket.off('chat:error', onError);
          reject(new Error(formatChatStepError(payload)));
        };

        socket.on('chat:end', onEnd);
        socket.on('chat:error', onError);
      }),
    [socketRef]
  );

  const handleIdleTurn = useCallback(async (): Promise<boolean> => {
    if (assistantContinuousListening) {
      return false;
    }
    consecutiveIdleTurnsRef.current += 1;
    if (consecutiveIdleTurnsRef.current >= MAX_IDLE_TURNS) {
      await stopSessionRef.current({ idleMessage: IDLE_END_MESSAGE });
      return true;
    }
    return false;
  }, [assistantContinuousListening]);

  const runConversationLoop = useCallback(
    async () => {
      if (loopRunningRef.current || stoppedRef.current) return;
      loopRunningRef.current = true;

      while (!stoppedRef.current) {
        try {
          if (
            !assistantContinuousListening &&
            Date.now() - lastActivityRef.current >= SESSION_IDLE_MS
          ) {
            await stopSessionRef.current({
              idleMessage: 'Voice chat ended — inactive',
            });
            break;
          }

          await ttsQueueRef.current?.abort();
          ttsQueueRef.current = null;
          await stopSpeechPlayback();

          setPhase('listening');
          setError(null);

          const outcome = await recordUntilSilence({
            backgroundRecording: assistantContinuousListening,
          });
          if (stoppedRef.current) break;

          if (outcome.kind === 'cancelled') {
            break;
          }

          if (outcome.kind === 'idle') {
            if (await handleIdleTurn()) break;
            continue;
          }

          setPhase('transcribing');
          const text = await transcribeViaSocket(sessionIdRef.current, outcome.uri);

          if (stoppedRef.current) break;
          if (!text) {
            if (await handleIdleTurn()) break;
            continue;
          }

          let sid: string;
          try {
            sid = await ensureVoiceSession();
          } catch (e) {
            if (!stoppedRef.current) {
              setError(e instanceof Error ? e.message : 'Could not start voice chat');
            }
            break;
          }

          markActivity();
          resetStream();
          latestAssistantRef.current = '';
          streamedCharsRef.current = 0;

          const ttsQueue = speakRepliesEnabled ? new SentenceTtsQueue() : null;
          ttsQueueRef.current = ttsQueue;

          const socket = socketRef.current;
          const onChunk = (data: ChatChunkPayload) => {
            if (data.chatSessionId !== sid) return;
            streamedCharsRef.current += data.chunk.length;
            if (ttsQueue) {
              ttsQueue.pushChunk(data.chunk);
              setPhase('speaking');
            } else {
              setPhase('waiting_for_ai');
            }
            lastActivityRef.current = Date.now();
          };

          if (socket) {
            socket.on('chat:chunk', onChunk);
          }

          setPhase('waiting_for_ai');
          setIsGenerating(true);

          emitMessage(text, defaultRag, { source: 'voice' });

          try {
            const assistantMessage = await waitForAssistantReply(sid);
            if (stoppedRef.current) break;

            markActivity();
            if (ttsQueue) {
              const remainder = assistantMessage.content.slice(streamedCharsRef.current);
              if (remainder.trim()) {
                ttsQueue.pushChunk(remainder);
              }
              setPhase('speaking');
              await ttsQueue.flush();
            }
          } finally {
            socket?.off('chat:chunk', onChunk);
            ttsQueueRef.current = null;
          }

          if (stoppedRef.current) break;
          markActivity();
          await new Promise((r) => setTimeout(r, POST_SPEECH_DELAY_MS));
        } catch (e) {
          await ttsQueueRef.current?.abort();
          ttsQueueRef.current = null;
          if (!stoppedRef.current) {
            setError(formatUserVoiceError(e));
          }
          break;
        }
      }

      loopRunningRef.current = false;
      if (stoppedRef.current) {
        setPhase('idle');
      }
    },
    [
      assistantContinuousListening,
      speakRepliesEnabled,
      defaultRag,
      recordUntilSilence,
      transcribeViaSocket,
      waitForAssistantReply,
      resetStream,
      setIsGenerating,
      emitMessage,
      handleIdleTurn,
      markActivity,
      ensureVoiceSession,
    ]
  );

  const beginVoiceLoop = useCallback(
    async (existingId?: string, existingMessages?: ChatMessage[]) => {
      setError(null);
      if (existingMessages) {
        setMessages(existingMessages);
      } else {
        setMessages([]);
      }
      resetStream();
      stoppedRef.current = false;
      consecutiveIdleTurnsRef.current = 0;
      lastActivityRef.current = Date.now();
      latestAssistantRef.current = '';
      sessionIdRef.current = existingId ?? null;
      setSessionId(existingId ?? null);
      setPhase('listening');

      try {
        await startVoiceAssistantService();
      } catch (serviceError) {
        console.warn('Voice foreground service unavailable:', serviceError);
      }
      void runConversationLoop();
    },
    [runConversationLoop, resetStream, setMessages]
  );

  const startSession = useCallback(async () => {
    if (phase !== 'idle') return;

    try {
      await beginVoiceLoop();
    } catch (e) {
      stoppedRef.current = true;
      setPhase('idle');
      setError(e instanceof Error ? e.message : 'Could not start voice chat');
    }
  }, [phase, beginVoiceLoop]);

  const resumeSession = useCallback(
    async (existingId: string) => {
      if (phase !== 'idle') return;

      try {
        const existingMessages = await apiClient.getMessages(existingId);
        await beginVoiceLoop(existingId, existingMessages);
      } catch (e) {
        stoppedRef.current = true;
        setPhase('idle');
        setError(e instanceof Error ? e.message : 'Could not resume voice chat');
      }
    },
    [phase, beginVoiceLoop]
  );

  const isActive = phase !== 'idle' && phase !== 'stopping';

  useEffect(() => {
    setRuntime({ phase, isActive });
  }, [phase, isActive, setRuntime]);

  useEffect(() => {
    registerHandlers({
      start: startSession,
      stop: () => stopSession(),
    });
    return () => registerHandlers(null);
  }, [registerHandlers, startSession, stopSession]);

  const showStreamBubble =
    isActive &&
    (phase === 'waiting_for_ai' ||
      phase === 'speaking' ||
      phase === 'transcribing') &&
    (isStreaming || Boolean(visibleText));

  const displayMessages = showStreamBubble
    ? buildStreamingMessages(messages, visibleText, isStreaming || Boolean(visibleText))
    : messages;

  return {
    phase,
    isActive,
    messages: displayMessages,
    visibleText,
    isStreaming,
    isGenerating,
    socketRef,
    sessionId,
    error,
    meteringLevel,
    meteringDecibels,
    meteringDataPoints,
    isSpeechDetected: speechDetected,
    startSession,
    resumeSession,
    stopSession: () => stopSession(),
  };
}
