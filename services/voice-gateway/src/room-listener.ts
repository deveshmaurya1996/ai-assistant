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

const INPUT_SAMPLE_RATE = 48_000;
const SILENCE_MS = 900;
const MIN_SPEECH_MS = 400;
const RMS_THRESHOLD = 0.012;
const RMS_THRESHOLD_WHILE_PLAYING = 0.04;
const MIN_VOICED_AUDIO_MS = 220;
const MIN_VOICED_BYTES = 12_000;

function pcmRms(frame: { data: Int16Array }): number {
  const samples = frame.data;
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const n = samples[i] / 32768;
    sum += n * n;
  }
  return Math.sqrt(sum / samples.length);
}

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

  const handleParticipant = async (participant: RemoteParticipant) => {
    for (const pub of participant.trackPublications.values()) {
      if (pub.kind !== TrackKind.KIND_AUDIO || !pub.track) continue;
      void listenToUserAudio(pub.track, participant.identity);
    }
  };

  const listenToUserAudio = async (track: Track, identity: string) => {
    const stream = new AudioStream(track, INPUT_SAMPLE_RATE, 1);
    const reader = stream.getReader();

    let speechStream = stt.startStream({
      onFinal: (text) => {
        void onFinalTranscript(text.trim());
      },
      onError: (err) => {
        console.warn('[voice-agent] stt error', err.message);
      },
    });

    let speaking = false;
    let speechStartedAt = 0;
    let lastVoiceAt = 0;
    let voicedMs = 0;
    let voicedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const rms = pcmRms(value);
        const now = Date.now();
        const frameBuf = Buffer.from(value.data.buffer, value.data.byteOffset, value.data.byteLength);
        const rmsThreshold = publisher.isPlaying() ? RMS_THRESHOLD_WHILE_PLAYING : RMS_THRESHOLD;

        if (rms >= rmsThreshold) {
          if (!speaking) {
            speaking = true;
            speechStartedAt = now;
          }
          lastVoiceAt = now;
          voicedMs += Math.floor((value.data.length / INPUT_SAMPLE_RATE) * 1000);
          voicedBytes += frameBuf.byteLength;
          if (abortRef.current) {
            const canInterruptSpeech =
              publisher.isPlaying() && voicedMs >= MIN_VOICED_AUDIO_MS;
            const canInterruptThinking =
              processing && !turnOutputActive && voicedMs >= MIN_VOICED_AUDIO_MS;
            if (canInterruptSpeech || canInterruptThinking) {
              abortRef.current.abort();
              publisher.interrupt();
              abortRef.current = null;
            }
          }
          speechStream.pushAudio(frameBuf);
          continue;
        }

        if (speaking && now - lastVoiceAt >= SILENCE_MS) {
          speaking = false;
          const speechMs = now - speechStartedAt;
          const hasEnoughVoicedAudio =
            voicedMs >= MIN_VOICED_AUDIO_MS && voicedBytes >= MIN_VOICED_BYTES;
          if (speechMs >= MIN_SPEECH_MS && hasEnoughVoicedAudio) {
            speechStream.end();
          } else {
            speechStream.cancel();
          }
          voicedMs = 0;
          voicedBytes = 0;
          speechStream = stt.startStream({
            onFinal: (text) => {
              void onFinalTranscript(text.trim());
            },
            onError: (err) => {
              console.warn('[voice-agent] stt error', err.message);
            },
          });
        }
      }
    } catch (err) {
      console.warn('[voice-agent] audio loop ended', identity, err);
    } finally {
      speechStream.cancel();
      reader.releaseLock();
    }
  };

  const onFinalTranscript = async (text: string) => {
    if (!text || processing || welcoming) return;
    processing = true;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    await setUserTranscript(room.localParticipant, text);

    const sttStarted = Date.now();
    await setAgentState(room.localParticipant, 'thinking');

    try {
      turnOutputActive = false;
      await setAgentTranscript(room.localParticipant, '');
      await processVoiceTranscript({
        roomId,
        transcript: text,
        sttLatencyMs: 0,
        signal: abortRef.current.signal,
        publishPcm: (chunk) => publisher.publishPcm(chunk),
        endPublish: () => publisher.endUtterance(),
        onInterrupt: () => publisher.interrupt(),
        onSpeaking: async () => {
          turnOutputActive = true;
          await setAgentState(room.localParticipant, 'speaking');
        },
        onTranscriptUpdate: async (transcript) => {
          await setAgentTranscript(room.localParticipant, transcript);
        },
        onMessagesTick: async () => {
          await bumpMessagesTick(room.localParticipant);
        },
        onListening: async () => {
          turnOutputActive = false;
          await setAgentState(room.localParticipant, 'listening');
        },
      });
    } catch (err) {
      console.warn('[voice-agent] turn failed', err);
    } finally {
      processing = false;
      turnOutputActive = false;
      await setUserTranscript(room.localParticipant, '');
      await setAgentTranscript(room.localParticipant, '');
      await bumpMessagesTick(room.localParticipant);
      await setAgentState(room.localParticipant, 'listening');
    }

    void sttStarted;
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
    await speakOut(buildWelcomePhrase(profile.personalityId), {
      signal: welcomeAbort.signal,
    });
    console.info('[voice-agent] welcome spoken');
  } catch (err) {
    console.warn('[voice-agent] welcome failed', err);
  } finally {
    welcoming = false;
    abortRef.current = null;
  }

  await setAgentState(room.localParticipant, 'listening');

  await new Promise<void>((resolve) => {
    room.on(RoomEvent.Disconnected, () => {
      abortRef.current?.abort();
      if (session.chatSessionId) {
        void abortGatewayTurn(session.chatSessionId);
      }
      resolve();
    });
  });
}
