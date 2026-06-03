import { create } from 'zustand';

type ComposeDraftState = {
  liveSessionId: string | null;
  promotingInPlace: boolean;
  setLiveSessionId: (sessionId: string | null) => void;
  setPromotingInPlace: (value: boolean) => void;
};

export const useComposeDraftStore = create<ComposeDraftState>((set) => ({
  liveSessionId: null,
  promotingInPlace: false,
  setLiveSessionId: (sessionId) => set({ liveSessionId: sessionId }),
  setPromotingInPlace: (value) => set({ promotingInPlace: value }),
}));
