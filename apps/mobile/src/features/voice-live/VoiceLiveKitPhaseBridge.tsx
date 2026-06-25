import { useEffect, useRef, useState } from 'react';
import {
  useConnectionState,
  useRoomContext,
  useVoiceAssistant,
  useSpeakingParticipants,
  useLocalParticipant,
} from '@livekit/components-react';
import { ConnectionState, RoomEvent } from 'livekit-client';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';
import { useVoiceSessionBridge } from '@/features/voice-assistant/voiceSessionBridge';

const AGENT_STATE_ATTR = 'lk.agent.state';
const AGENT_TRANSCRIPT_ATTR = 'lk.agent.transcript';
const USER_TRANSCRIPT_ATTR = 'lk.agent.user_transcript';
const MESSAGES_TICK_ATTR = 'lk.agent.messages_tick';

type Props = {
  isActive: boolean;
  onPhase: (phase: VoiceAssistantPhase) => void;
  onAgentTranscript?: (text: string) => void;
  onUserTranscript?: (text: string) => void;
  onMessagesTick?: (tickValue?: string) => void;
};

function mapAgentState(state: string): VoiceAssistantPhase | null {
  switch (state) {
    case 'initializing':
    case 'listening':
    case 'idle':
      return 'listening';
    case 'thinking':
      return 'waiting_for_ai';
    case 'speaking':
      return 'speaking';
    default:
      return null;
  }
}

export function VoiceLiveKitPhaseBridge({
  isActive,
  onPhase,
  onAgentTranscript,
  onUserTranscript,
  onMessagesTick,
}: Props) {
  const room = useRoomContext();
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const speaking = useSpeakingParticipants();
  const { localParticipant } = useLocalParticipant();

  const lastPhaseRef = useRef<VoiceAssistantPhase | null>(null);
  const lastTranscriptRef = useRef('');
  const lastUserTranscriptRef = useRef('');
  const lastMessagesTickRef = useRef('');
  const lastConnectionStateRef = useRef(connectionState);
  const [roomTick, setRoomTick] = useState(0);

  useEffect(() => {
    if (isActive) {
      useVoiceSessionBridge.getState().setLiveKitData({
        state,
        audioTrack,
        speaking,
        localParticipant,
      });
    } else {
      useVoiceSessionBridge.getState().setLiveKitData({
        state: null,
        audioTrack: null,
        speaking: [],
        localParticipant: null,
      });
    }
  }, [isActive, state, audioTrack, speaking, localParticipant]);

  useEffect(() => {
    return () => {
      useVoiceSessionBridge.getState().setLiveKitData({
        state: null,
        audioTrack: null,
        speaking: [],
        localParticipant: null,
      });
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const bump = () => setRoomTick((n) => n + 1);

    room.on(RoomEvent.ParticipantConnected, bump);
    room.on(RoomEvent.ParticipantDisconnected, bump);
    room.on(RoomEvent.ParticipantAttributesChanged, bump);
    room.on(RoomEvent.ConnectionStateChanged, bump);

    return () => {
      room.off(RoomEvent.ParticipantConnected, bump);
      room.off(RoomEvent.ParticipantDisconnected, bump);
      room.off(RoomEvent.ParticipantAttributesChanged, bump);
      room.off(RoomEvent.ConnectionStateChanged, bump);
    };
  }, [isActive, room]);

  useEffect(() => {
    if (
      isActive &&
      connectionState === ConnectionState.Connected &&
      lastConnectionStateRef.current === ConnectionState.Reconnecting
    ) {
      onMessagesTick?.();
    }
    lastConnectionStateRef.current = connectionState;
  }, [connectionState, isActive, onMessagesTick]);

  useEffect(() => {
    const remotes = Array.from(room.remoteParticipants.values());
    if (!isActive) {
      lastPhaseRef.current = null;
      lastTranscriptRef.current = '';
      lastUserTranscriptRef.current = '';
      lastMessagesTickRef.current = '';
      return;
    }

    const remoteAgent = remotes.find(
      (p) => p.attributes?.[AGENT_STATE_ATTR] || /^agent-/i.test(p.identity ?? '')
    );

    const remoteAgentState = remoteAgent?.attributes?.[AGENT_STATE_ATTR];
    let handled = false;
    if (remoteAgent && connectionState !== ConnectionState.Connected) {
      const phase = remoteAgentState ? mapAgentState(remoteAgentState) : 'listening';
      onPhase(phase!);
      lastPhaseRef.current = phase!;
      handled = true;
    }

    const remoteTranscript = remoteAgent?.attributes?.[AGENT_TRANSCRIPT_ATTR] ?? '';
    const remoteUserTranscript = remoteAgent?.attributes?.[USER_TRANSCRIPT_ATTR] ?? '';
    const remoteMessagesTick = remoteAgent?.attributes?.[MESSAGES_TICK_ATTR] ?? '';

    if (remoteTranscript !== lastTranscriptRef.current) {
      lastTranscriptRef.current = remoteTranscript;
      onAgentTranscript?.(remoteTranscript);
    }

    if (remoteUserTranscript !== lastUserTranscriptRef.current) {
      lastUserTranscriptRef.current = remoteUserTranscript;
      onUserTranscript?.(remoteUserTranscript);
    }

    if (remoteMessagesTick && remoteMessagesTick !== lastMessagesTickRef.current) {
      lastMessagesTickRef.current = remoteMessagesTick;
      onMessagesTick?.(remoteMessagesTick);
    }

    if (handled) {
      return;
    }

    if (connectionState !== ConnectionState.Connected) {
      if (lastPhaseRef.current !== 'connecting') {
        lastPhaseRef.current = 'connecting';
        onPhase('connecting');
      }
      return;
    }

    const fromRemote = remoteAgentState ? mapAgentState(remoteAgentState) : null;
    const fromHook = mapAgentState(state);
    const resolvedPhase = fromRemote ?? fromHook ?? (remoteAgent ? 'listening' : null);

    if (!resolvedPhase) return;

    if (lastPhaseRef.current !== resolvedPhase || resolvedPhase === 'listening') {
      lastPhaseRef.current = resolvedPhase;
      onPhase(resolvedPhase);
    }
  }, [
    connectionState,
    isActive,
    onAgentTranscript,
    onMessagesTick,
    onPhase,
    onUserTranscript,
    room,
    roomTick,
    state,
  ]);

  return null;
}