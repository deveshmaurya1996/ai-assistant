import { create } from 'zustand';

export type OverlaySessionKind = 'text' | 'voice';

export type OverlaySessionMeta = {
  title: string;
  kind: OverlaySessionKind;
  updatedAt: number;
};

type OverlayLastReply = {
  text: string;
  updatedAt: number;
};

type OverlaySessionState = {
  sessions: Record<string, OverlaySessionMeta>;
  lastReplies: Record<string, OverlayLastReply>;
  userDismissed: boolean;
  upsertSession: (
    sessionId: string,
    patch: Partial<Pick<OverlaySessionMeta, 'title' | 'kind'>>
  ) => void;
  setTitle: (sessionId: string, title: string) => void;
  setLastReply: (sessionId: string, text: string) => void;
  clearLastReply: (sessionId: string) => void;
  setUserDismissed: (dismissed: boolean) => void;
};

export function formatSessionFallbackLabel(sessionId: string): string {
  const short = sessionId.length > 8 ? `${sessionId.slice(0, 8)}…` : sessionId;
  return `Chat · ${short}`;
}

export const useOverlaySessionStore = create<OverlaySessionState>((set) => ({
  sessions: {},
  lastReplies: {},
  userDismissed: false,

  upsertSession: (sessionId, patch) => {
    set((state) => {
      const prev = state.sessions[sessionId];
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            title: patch.title ?? prev?.title ?? formatSessionFallbackLabel(sessionId),
            kind: patch.kind ?? prev?.kind ?? 'text',
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  setTitle: (sessionId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    set((state) => {
      const prev = state.sessions[sessionId];
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            title: trimmed,
            kind: prev?.kind ?? 'text',
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  setLastReply: (sessionId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((state) => ({
      lastReplies: {
        ...state.lastReplies,
        [sessionId]: { text: trimmed, updatedAt: Date.now() },
      },
    }));
  },

  clearLastReply: (sessionId) => {
    set((state) => {
      const next = { ...state.lastReplies };
      delete next[sessionId];
      return { lastReplies: next };
    });
  },

  setUserDismissed: (dismissed) =>
    set(dismissed ? { userDismissed: true, lastReplies: {} } : { userDismissed: false }),
}));

export function getOverlayContextLabel(sessionId: string): string {
  const meta = useOverlaySessionStore.getState().sessions[sessionId];
  return meta?.title ?? formatSessionFallbackLabel(sessionId);
}
