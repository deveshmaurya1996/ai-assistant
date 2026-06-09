import { create } from 'zustand';

type ActiveChatSessionState = {
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
};

export const useActiveChatSessionStore = create<ActiveChatSessionState>((set) => ({
  activeSessionId: null,
  setActiveSessionId: (sessionId) => set({ activeSessionId: sessionId }),
}));

export function getActiveChatSessionId(): string | null {
  return useActiveChatSessionStore.getState().activeSessionId;
}
