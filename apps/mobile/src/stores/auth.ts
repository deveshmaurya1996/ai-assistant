import { create } from 'zustand';
import type { SessionInfo } from '@ai-assistant/sdk';
import { apiClient } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { getOAuthCallbackURL } from '@/lib/oauth-callback';
import { authSession } from '@/lib/auth-session';
import { hydrateAuthStorage } from '@/lib/secure-storage';
import { Platform } from 'react-native';

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
      const session = await authSession.refresh();
      set({ session, loading: false });
      return session;
    } catch {
      set({ session: null, loading: false });
      return null;
    }
  },
  signIn: async (email, password) => {
    const session = await apiClient.signIn(email, password);
    await authSession.refresh();
    set({ session });
  },
  signInWithGoogle: async () => {
    await hydrateAuthStorage();

    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: getOAuthCallbackURL(),
    });
    if (error) {
      throw new Error(error.message ?? 'Google sign-in failed');
    }
    if (Platform.OS === 'web') return;

    const session = await authSession.refresh();
    if (!session?.session) {
      throw new Error('Google sign-in did not return a session');
    }
    set({ session });
  },
  signUp: async (email, password, name) => {
    const session = await apiClient.signUp(email, password, name);
    await authSession.refresh();
    set({ session });
  },
  signOut: async () => {
    await authSession.signOut();
    set({ session: null });
  },
}));
