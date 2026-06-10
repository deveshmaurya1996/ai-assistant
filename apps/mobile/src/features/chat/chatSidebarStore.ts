import { create } from 'zustand';
import type { ChatSession } from '@ai-assistant/sdk';
import { collectInFlightSidebarSessions } from './collectInFlightSidebarSessions';

function mergeWithInFlightSessions(
  apiSessions: ChatSession[],
  localSessions: ChatSession[]
): ChatSession[] {
  const apiIds = new Set(apiSessions.map((s) => s.id));
  const inFlightIds = new Set(collectInFlightSidebarSessions());
  const preserved = localSessions.filter(
    (s) => inFlightIds.has(s.id) && !apiIds.has(s.id)
  );
  return [...preserved, ...apiSessions];
}

type ChatSidebarState = {
  sessions: ChatSession[];
  nextCursor: string | null;
  setPage: (sessions: ChatSession[], nextCursor: string | null, append: boolean) => void;
  patchTitle: (sessionId: string, title: string, kind?: ChatSession['kind']) => void;
  patchUnread: (sessionId: string, hasUnread: boolean) => void;
  removeSession: (sessionId: string) => void;
  upsertSession: (session: ChatSession) => void;
  reset: () => void;
};

export const useChatSidebarStore = create<ChatSidebarState>((set) => ({
  sessions: [],
  nextCursor: null,
  setPage: (sessions, nextCursor, append) =>
    set((state) => {
      const base = append ? [...state.sessions, ...sessions] : sessions;
      return {
        sessions: mergeWithInFlightSessions(base, state.sessions),
        nextCursor,
      };
    }),
  patchTitle: (sessionId, title, kind = 'text') =>
    set((state) => {
      const exists = state.sessions.some((s) => s.id === sessionId);
      if (!exists) {
        return {
          sessions: [{ id: sessionId, title, kind }, ...state.sessions],
        };
      }
      return {
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, title } : s
        ),
      };
    }),
  patchUnread: (sessionId, hasUnread) =>
    set((state) => {
      const idx = state.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return state;
      if (state.sessions[idx].hasUnread === hasUnread) return state;
      const next = [...state.sessions];
      next[idx] = { ...next[idx], hasUnread };
      return { sessions: next };
    }),
  removeSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
    })),
  upsertSession: (session) =>
    set((state) => {
      const without = state.sessions.filter((s) => s.id !== session.id);
      return { sessions: [session, ...without] };
    }),
  reset: () => set({ sessions: [], nextCursor: null }),
}));
