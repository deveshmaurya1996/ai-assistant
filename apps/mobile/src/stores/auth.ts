import { create } from 'zustand';
import {
  apiClient,
  loadStoredSession,
  persistSession,
  type SessionInfo,
} from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { clearAllSessions, syncSessionToApiClient } from '@/lib/session-sync';

type AuthState = {
  session: SessionInfo | null;
  loading: boolean;
  hydrate: () => Promise<SessionInfo | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true,
  hydrate: async () => {
    set({ loading: true });
    try {
      const fromAuthClient = await syncSessionToApiClient();
      if (fromAuthClient?.session) {
        set({ session: fromAuthClient, loading: false });
        return fromAuthClient;
      }

      const session = await loadStoredSession();
      set({ session, loading: false });
      return session;
    } catch {
      await clearAllSessions();
      set({ session: null, loading: false });
      return null;
    }
  },
  signIn: async (email, password) => {
    const session = await apiClient.signIn(email, password);
    await persistSession();
    set({ session });
  },
  signInWithGoogle: async () => {
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/auth/callback',
    });
    if (error) {
      throw new Error(error.message ?? 'Google sign-in failed');
    }
    const session = await syncSessionToApiClient();
    if (!session?.session) {
      throw new Error('Google sign-in did not return a session');
    }
    set({ session });
  },
  signUp: async (email, password, name) => {
    const session = await apiClient.signUp(email, password, name);
    await persistSession();
    set({ session });
  },
  signOut: async () => {
    await clearAllSessions();
    set({ session: null });
  },
}));
