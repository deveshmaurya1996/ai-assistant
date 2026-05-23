import { create } from 'zustand';
import {
  apiClient,
  clearSession,
  loadStoredSession,
  persistSession,
  type SessionInfo,
} from '@/lib/api';

type AuthState = {
  session: SessionInfo | null;
  loading: boolean;
  hydrate: () => Promise<SessionInfo | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true,
  hydrate: async () => {
    set({ loading: true });
    const session = await loadStoredSession();
    set({ session, loading: false });
    return session;
  },
  signIn: async (email, password) => {
    const session = await apiClient.signIn(email, password);
    await persistSession();
    set({ session });
  },
  signUp: async (email, password, name) => {
    const session = await apiClient.signUp(email, password, name);
    await persistSession();
    set({ session });
  },
  signOut: async () => {
    await clearSession();
    set({ session: null });
  },
}));
