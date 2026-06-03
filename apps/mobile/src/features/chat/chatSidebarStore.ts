import { create } from 'zustand';
import type { ChatSession } from '@ai-assistant/sdk';

type ChatSidebarState = {
  sessions: ChatSession[];
  nextCursor: string | null;
  setPage: (sessions: ChatSession[], nextCursor: string | null, append: boolean) => void;
  patchTitle: (sessionId: string, title: string) => void;
  removeSession: (sessionId: string) => void;
  upsertSession: (session: ChatSession) => void;
  reset: () => void;
};

export const useChatSidebarStore = create<ChatSidebarState>((set) => ({
  sessions: [],
  nextCursor: null,
  setPage: (sessions, nextCursor, append) =>
    set((state) => ({
      sessions: append ? [...state.sessions, ...sessions] : sessions,
      nextCursor,
    })),
  patchTitle: (sessionId, title) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      ),
    })),
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
