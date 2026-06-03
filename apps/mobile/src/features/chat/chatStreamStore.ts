import { create } from 'zustand';

export const PENDING_CHAT_STREAM_KEY = '__pending__';

export type SessionStreamState = {
  streamText: string;
  isGenerating: boolean;
  statusMessage: string | null;
  revision: number;
};

type ChatStreamState = {
  sessions: Record<string, SessionStreamState>;
  boundTurnSessionId: string | null;
  setBoundTurnSessionId: (sessionId: string | null) => void;
  beginTurn: (sessionKey: string) => void;
  setStatusMessage: (sessionKey: string, message: string | null) => void;
  appendChunk: (sessionKey: string, chunk: string) => void;
  endTurn: (sessionKey: string) => void;
  clearTurn: (sessionKey: string) => void;
  abortTurn: (sessionKey: string) => void;
  migratePendingToSession: (sessionId: string) => void;
  isSessionGenerating: (sessionId: string) => boolean;
};

function emptySession(): SessionStreamState {
  return { streamText: '', isGenerating: false, statusMessage: null, revision: 0 };
}

function bump(session: SessionStreamState): SessionStreamState {
  return { ...session, revision: session.revision + 1 };
}

export const useChatStreamStore = create<ChatStreamState>((set, get) => ({
  sessions: {},
  boundTurnSessionId: null,

  setBoundTurnSessionId: (sessionId) => set({ boundTurnSessionId: sessionId }),

  beginTurn: (sessionKey) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionKey]: { streamText: '', isGenerating: true, statusMessage: null, revision: 0 },
      },
    }));
  },

  setStatusMessage: (sessionKey, message) => {
    set((state) => {
      const prev = state.sessions[sessionKey] ?? emptySession();
      return {
        sessions: {
          ...state.sessions,
          [sessionKey]: bump({ ...prev, statusMessage: message }),
        },
      };
    });
  },

  appendChunk: (sessionKey, chunk) => {
    if (!chunk) return;
    set((state) => {
      const prev = state.sessions[sessionKey] ?? emptySession();
      return {
        sessions: {
          ...state.sessions,
          [sessionKey]: bump({
            ...prev,
            streamText: prev.streamText + chunk,
            isGenerating: true,
            statusMessage: chunk ? null : prev.statusMessage,
          }),
        },
      };
    });
  },

  endTurn: (sessionKey) => {
    set((state) => {
      const prev = state.sessions[sessionKey];
      if (!prev) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionKey]: bump({ ...prev, isGenerating: false }),
        },
      };
    });
  },

  clearTurn: (sessionKey) => {
    set((state) => {
      const next = { ...state.sessions };
      delete next[sessionKey];
      return { sessions: next };
    });
  },

  abortTurn: (sessionKey) => {
    get().clearTurn(sessionKey);
  },

  migratePendingToSession: (sessionId) => {
    set((state) => {
      const pending = state.sessions[PENDING_CHAT_STREAM_KEY];
      if (!pending) return state;

      const next = { ...state.sessions };
      delete next[PENDING_CHAT_STREAM_KEY];

      const existing = next[sessionId];
      if (existing?.isGenerating || existing?.streamText) {
        next[sessionId] = bump({
          ...existing,
          streamText: existing.streamText + pending.streamText,
          isGenerating: pending.isGenerating || existing.isGenerating,
          statusMessage: pending.statusMessage ?? existing.statusMessage,
        });
      } else if (pending.isGenerating || pending.streamText) {
        next[sessionId] = { ...pending };
      }

      return { sessions: next };
    });
  },

  isSessionGenerating: (sessionId) => Boolean(get().sessions[sessionId]?.isGenerating),
}));

export function resolveStreamSessionKey(
  sessionId: string | null | undefined,
  boundTurnSessionId: string | null
): string {
  if (sessionId) return sessionId;
  if (boundTurnSessionId) return boundTurnSessionId;
  return PENDING_CHAT_STREAM_KEY;
}

export function selectSessionStream(
  sessions: Record<string, SessionStreamState>,
  sessionId: string | null | undefined,
  boundTurnSessionId: string | null = null
): SessionStreamState | undefined {
  return sessions[resolveStreamSessionKey(sessionId, boundTurnSessionId)];
}
