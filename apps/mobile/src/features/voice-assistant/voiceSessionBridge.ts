import { create } from 'zustand';
import type { VoiceAssistantPhase } from './useVoiceAssistantSession';

type VoiceHandlers = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type VoiceSessionBridgeState = {
  phase: VoiceAssistantPhase;
  isActive: boolean;
  handlers: VoiceHandlers | null;
  setRuntime: (patch: {
    phase?: VoiceAssistantPhase;
    isActive?: boolean;
  }) => void;
  registerHandlers: (handlers: VoiceHandlers | null) => void;
  requestStart: () => Promise<boolean>;
  requestStop: () => Promise<void>;
};

export const useVoiceSessionBridge = create<VoiceSessionBridgeState>((set, get) => ({
  phase: 'idle',
  isActive: false,
  handlers: null,

  setRuntime: (patch) =>
    set((s) => ({
      phase: patch.phase ?? s.phase,
      isActive: patch.isActive ?? s.isActive,
    })),

  registerHandlers: (handlers) => set({ handlers }),

  requestStart: async () => {
    const { handlers, isActive } = get();
    if (isActive || !handlers) return false;
    await handlers.start();
    return true;
  },

  requestStop: async () => {
    const { handlers } = get();
    if (!handlers) return;
    await handlers.stop();
  },
}));
