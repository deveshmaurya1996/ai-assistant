import { create } from 'zustand';
import type { VoiceAssistantPhase } from './useVoiceAssistantSession';

type VoiceHandlers = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type VoiceSessionBridgeState = {
  phase: VoiceAssistantPhase;
  isActive: boolean;
  chatSessionId: string | null;
  handlers: VoiceHandlers | null;
  setRuntime: (patch: {
    phase?: VoiceAssistantPhase;
    isActive?: boolean;
    chatSessionId?: string | null;
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

  setRuntime: (patch) =>
    set((s) => ({
      phase: patch.phase ?? s.phase,
      isActive: patch.isActive ?? s.isActive,
      chatSessionId:
        patch.chatSessionId !== undefined ? patch.chatSessionId : s.chatSessionId,
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
