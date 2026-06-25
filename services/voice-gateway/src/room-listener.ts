import {
  AudioStream,
  RoomEvent,
  TrackKind,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type Room,
  type Track,
} from '@livekit/rtc-node';
import { resolveProviders } from './providers/registry.js';
import { processVoiceTranscript } from './voice-turn-processor.js';
import { loadVoiceSession } from './session-store.js';
import { getVoiceProfileForPersonality } from '@ai-assistant/types';
import { AgentAudioPublisher } from './audio-publisher.js';
import { abortGatewayTurn } from './turn-client.js';
import { setAgentState, setAgentTranscript, setUserTranscript, bumpMessagesTick } from './agent-state.js';
import { buildWelcomePhrase, speakPhrase } from './speak-phrase.js';

const INPUT_SAMPLE_RATE = 16_000;

export async function runRoomVoiceLoop(room: Room): Promise<void> {
  const roomId = room.name ?? '';
  const session = await loadVoiceSession(roomId);
  if (!session) {
    console.warn('[voice-agent] no redis session for room', roomId);
    return;
  }

  const profile = getVoiceProfileForPersonality(session.voiceProfileId);
  const { stt } = resolveProviders(profile);
  const publisher = new AgentAudioPublisher(room);

  const abortRef = { current: null as AbortController | null };

  let processing = false;
  let welcoming = false;
  let turnOutputActive = false;

  let activeTurnSeq = 0;
  let pendingTranscript: string | null = null;

  const listenedTrackKeys = new Set<string>();



  const abortCurrentTurn = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (session.chatSessionId) {
      void abortGatewayTurn(session.chatSessionId);
    }
  };

  const speakOut = async (
    text: string,
    opts?: { signal?: AbortSignal }
  ): Promise<void> => {
    await speakPhrase({
      text,
      voiceProfileId: session.voiceProfileId,
      signal: opts?.signal,
      publishPcm: (chunk) => publisher.publishPcm(chunk),
      endPublish: () => publisher.endUtterance(),
      onSpeaking: () => setAgentState(room.localParticipant, 'speaking'),
      onListening: () => setAgentState(room.localParticipant, 'listening'),
    });
  };

  const startTurn = async (text: string, sttLatencyMs = 0) => {
    const trimmed = text.trim();
    if (!trimmed || welcoming) return;

    const turnSeq = ++activeTurnSeq;
    processing = true;

    abortCurrentTurn();
    const controller = new AbortController();
    abortRef.current = controller;

    await setUserTranscript(room.localParticipant, trimmed);
    await setAgentState(room.localParticipant, 'thinking');

    try {
      turnOutputActive = false;
      await setAgentTranscript(room.localParticipant, '');

      await processVoiceTranscript({
        roomId,
        transcript: trimmed,
        sttLatencyMs,
        signal: controller.signal,
        publishPcm: (chunk) => publisher.publishPcm(chunk),
        endPublish: () => publisher.endUtterance(),
        onInterrupt: () => publisher.interrupt(),
        onSpeaking: async () => {
          if (turnSeq !== activeTurnSeq || controller.signal.aborted) return;
          turnOutputActive = true;
          await setAgentState(room.localParticipant, 'speaking');
        },
        onTranscriptUpdate: async (transcript) => {
          if (turnSeq !== activeTurnSeq || controller.signal.aborted) return;
          await setAgentTranscript(room.localParticipant, transcript);
        },
        onMessagesTick: async () => {
          if (turnSeq !== activeTurnSeq) return;
          await bumpMessagesTick(room.localParticipant);
        },
        onListening: async () => {
          if (turnSeq !== activeTurnSeq || controller.signal.aborted) return;
          turnOutputActive = false;
          await setAgentState(room.localParticipant, 'listening');
        },
      });
    } catch (err) {
      console.warn('[voice-agent] turn failed', err);
    } finally {
      if (turnSeq === activeTurnSeq) {
        processing = false;
        turnOutputActive = false;
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        await setUserTranscript(room.localParticipant, '');
        await setAgentTranscript(room.localParticipant, '');
        await bumpMessagesTick(room.localParticipant);
        await setAgentState(room.localParticipant, 'listening');
      }

      if (turnSeq === activeTurnSeq && pendingTranscript?.trim()) {
        const next = pendingTranscript.trim();
        pendingTranscript = null;
        void startTurn(next, 0);
      }
    }
  };

  const onFinalTranscript = async (text: string, sttLatencyMs = 0) => {
    const trimmed = text.trim();
    if (!trimmed || welcoming) return;

    if (processing) {
      pendingTranscript = trimmed;
      abortCurrentTurn();
      publisher.interrupt();
      return;
    }

    void startTurn(trimmed, sttLatencyMs);
  };

  const handleParticipant = async (participant: RemoteParticipant) => {
    for (const pub of participant.trackPublications.values()) {
      if (pub.kind !== TrackKind.KIND_AUDIO || !pub.track) continue;
      void listenToUserAudio(pub.track, participant.identity);
    }
  };
const listenToUserAudio = async (track: Track, identity: string) => {
  const trackKey = `${identity}:${(track as RemoteAudioTrack).sid ?? 'unknown'}`;
  if (listenedTrackKeys.has(trackKey)) return;
  listenedTrackKeys.add(trackKey);

  const stream = new AudioStream(track, INPUT_SAMPLE_RATE, 1);
  const reader = stream.getReader();

  let hardBargeInTriggered = false;

  const isMeaningfulPartial = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.length < 3) return false;
    if (!/[a-zA-Z0-9]/.test(trimmed)) return false;

    const lower = trimmed.toLowerCase();
    if (['uh', 'um', 'hmm', 'mm', 'ah', 'oh'].includes(lower)) return false;

    return true;
  };

  const speechStream = stt.startStream({
    onSpeechStart: () => {
      if (welcoming) return;
      console.log('[room-listener] VAD: speech started');
      if (publisher.isPlaying()) {
        publisher.interrupt();
      }
    },
    onPartial: (text) => {
      if (welcoming) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      console.log(`[room-listener] STT partial: "${trimmed}"`);

      if (!isMeaningfulPartial(trimmed)) {
        return;
      }

      // Hard barge-in only once per active speech segment
      if (!hardBargeInTriggered && (publisher.isPlaying() || processing)) {
        hardBargeInTriggered = true;
        console.log('[room-listener] Hard barge-in triggered with partial:', trimmed);
        publisher.interrupt();
        abortCurrentTurn();
      }
    },
    onFinal: (text) => {
      if (welcoming) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      console.log(`[room-listener] STT final: "${trimmed}"`);
      hardBargeInTriggered = false;
      void onFinalTranscript(trimmed, 0);
    },
    onSpeechEnd: () => {
      if (welcoming) return;
      console.log('[room-listener] VAD: speech ended');
      hardBargeInTriggered = false;
    },
    onError: (err) => {
      console.warn('[voice-agent] stt error', err.message);
      hardBargeInTriggered = false;
    },
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const frameBuf = Buffer.from(
        value.data.buffer,
        value.data.byteOffset,
        value.data.byteLength
      );

      speechStream.pushAudio(frameBuf);
    }
  } catch (err) {
    console.warn('[voice-agent] audio loop ended', identity, err);
  } finally {
    if (typeof speechStream.close === 'function') {
      await speechStream.close().catch(() => undefined);
    } else {
      speechStream.cancel();
    }

    reader.releaseLock();
    listenedTrackKeys.delete(trackKey);
  }
};

  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    if (participant.identity === room.localParticipant?.identity) return;
    void listenToUserAudio(track as Track, participant.identity);
  });

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    void handleParticipant(participant);
  });

  for (const participant of room.remoteParticipants.values()) {
    await handleParticipant(participant);
  }

  welcoming = true;
  const welcomeAbort = new AbortController();
  abortRef.current = welcomeAbort;

  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (!welcomeAbort.signal.aborted) {
      await speakOut(buildWelcomePhrase(profile.personalityId), {
        signal: welcomeAbort.signal,
      });
      console.info('[voice-agent] welcome spoken');
    }
  } catch (err) {
    console.warn('[voice-agent] welcome failed', err);
  } finally {
    welcoming = false;
    if (abortRef.current === welcomeAbort) {
      abortRef.current = null;
    }
  }

  await setAgentState(room.localParticipant, 'listening');

  await new Promise<void>((resolve) => {
    room.on(RoomEvent.Disconnected, () => {
      abortCurrentTurn();
      publisher.interrupt();
      resolve();
    });
  });
}