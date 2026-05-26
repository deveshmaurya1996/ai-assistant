import { create } from 'zustand';
import type { SessionInfo } from '@ai-assistant/sdk';
import { authClient, fetchSession } from '@/lib/auth-client';
import { getOAuthCallbackURL } from '@/lib/oauth-callback';
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
      await hydrateAuthStorage();
      const session = await fetchSession();
      set({ session, loading: false });
      return session;
    } catch {
      set({ session: null, loading: false });
      return null;
    }
  },
  signIn: async (email, password) => {
    await hydrateAuthStorage();
    const { error } = await authClient.signIn.email({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message ?? 'Sign in failed');
    }
    const session = await fetchSession();
    if (!session) {
      throw new Error('Sign in did not return a session');
    }
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

    const session = await fetchSession();
    if (!session) {
      throw new Error('Google sign-in did not return a session');
    }
    set({ session });
  },
  signUp: async (email, password, name) => {
    await hydrateAuthStorage();
    const { error } = await authClient.signUp.email({
      email,
      password,
      name,
    });
    if (error) {
      throw new Error(error.message ?? 'Sign up failed');
    }
    const session = await fetchSession();
    if (!session) {
      throw new Error('Sign up did not return a session');
    }
    set({ session });
  },
  signOut: async () => {
    await authClient.signOut();
    set({ session: null });
  },
}));
