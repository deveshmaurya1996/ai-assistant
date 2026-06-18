import { create } from 'zustand';
import type { VoiceAssistantPhase } from './useVoiceAssistantSession';
import { runWithVoiceSessionSlot } from './voiceSessionGuard';

type VoiceHandlers = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type VoiceSessionBridgeState = {
  phase: VoiceAssistantPhase;
  isActive: boolean;
  chatSessionId: string | null;
  handlers: VoiceHandlers | null;
  liveKitState: any;
  liveKitAudioTrack: any;
  liveKitSpeaking: any[];
  liveKitLocalParticipant: any;
  setRuntime: (patch: {
    phase?: VoiceAssistantPhase;
    isActive?: boolean;
    chatSessionId?: string | null;
  }) => void;
  setLiveKitData: (data: {
    state?: any;
    audioTrack?: any;
    speaking?: any[];
    localParticipant?: any;
  }) => void;
  registerHandlers: (handlers: VoiceHandlers | null) => void;
  requestStart: () => Promise<boolean>;
  requestStop: () => Promise<void>;
};

export const useVoiceSessionBridge = create<VoiceSessionBridgeState>((set, get) => ({
  phase: 'idle',
  isActive: false,
  chatSessionId: null,
  handlers: null,
  liveKitState: null,
  liveKitAudioTrack: null,
  liveKitSpeaking: [],
  liveKitLocalParticipant: null,

  setRuntime: (patch) =>
    set((s) => ({
      phase: patch.phase ?? s.phase,
      isActive: patch.isActive ?? s.isActive,
      chatSessionId:
        patch.chatSessionId !== undefined ? patch.chatSessionId : s.chatSessionId,
    })),

  setLiveKitData: (data) =>
    set((s) => ({
      liveKitState: data.state !== undefined ? data.state : s.liveKitState,
      liveKitAudioTrack: data.audioTrack !== undefined ? data.audioTrack : s.liveKitAudioTrack,
      liveKitSpeaking: data.speaking !== undefined ? data.speaking : s.liveKitSpeaking,
      liveKitLocalParticipant: data.localParticipant !== undefined ? data.localParticipant : s.liveKitLocalParticipant,
    })),

  registerHandlers: (handlers) => set({ handlers }),

  requestStart: async () => {
    const { handlers } = get();
    if (!handlers) return false;
    let started = false;
    await runWithVoiceSessionSlot(null, async () => {
      await handlers.start();
      started = true;
    });
    return started;
  },

  requestStop: async () => {
    const { handlers } = get();
    if (!handlers) return;
    await handlers.stop();
  },
}));
