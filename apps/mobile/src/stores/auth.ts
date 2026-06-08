import { create } from 'zustand';
import type { SessionInfo } from '@ai-assistant/sdk';
import {
  authClient,
  fetchSession,
} from '@/lib/auth-client';
import {
  fetchVerifiedSession,
  fetchVerifiedSessionWithRetry,
} from '@/lib/auth-session';
import { getOAuthCallbackURL } from '@/lib/oauth-callback';
import { hydrateAuthStorage } from '@/lib/secure-storage';
import { writeWebSessionCache } from '@/lib/web-session-cache';
import { clearAuthCookie, hasAuthCredentials } from '@/lib/auth-cookies';
import { clearApiAuth } from '@/lib/api-client';
import { useChatSidebarStore } from '@/features/chat/chatSidebarStore';
import { useChatStreamStore } from '@/features/chat/chatStreamStore';
import { Platform } from 'react-native';

type AuthState = {
  session: SessionInfo | null;
  loading: boolean;
  hydrated: boolean;
  hydrate: () => Promise<SessionInfo | null>;
  ensureAuthenticated: () => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

function resetClientStores(): void {
  useChatSidebarStore.getState().reset();
  useChatStreamStore.setState({ sessions: {}, boundTurnSessionId: null });
}

async function applySession(session: SessionInfo | null): Promise<void> {
  if (Platform.OS === 'web') writeWebSessionCache(session);
  useAuthStore.setState({ session });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  loading: true,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) {
      return get().session;
    }
    set({ loading: true });
    try {
      await hydrateAuthStorage();
      const session = await fetchVerifiedSession();
      set({ session, loading: false, hydrated: true });
      return session;
    } catch {
      set({ session: null, loading: false, hydrated: true });
      return null;
    }
  },

  ensureAuthenticated: async () => {
    await hydrateAuthStorage();
    const session = await fetchVerifiedSessionWithRetry(6, 300);
    if (!session) {
      set({ session: null, loading: false, hydrated: true });
      return false;
    }
    set({ session, loading: false, hydrated: true });
    return true;
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
    const session = await fetchVerifiedSessionWithRetry();
    if (!session) {
      throw new Error('Sign in succeeded but session could not be verified');
    }
    await applySession(session);
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
    if (Platform.OS !== 'web') {
      const session = await fetchVerifiedSessionWithRetry(
        Platform.OS === 'android' ? 8 : 4,
        300
      );
      if (session) {
        await applySession(session);
      }
      return;
    }

    const session = await fetchVerifiedSessionWithRetry();
    if (!session) {
      throw new Error('Google sign-in did not return a session');
    }
    await applySession(session);
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
    const session = await fetchVerifiedSessionWithRetry();
    if (!session) {
      throw new Error('Sign up did not return a session');
    }
    await applySession(session);
  },

  signOut: async () => {
    try {
      await authClient.signOut();
    } catch (err) {
      if (__DEV__) {
        console.warn(
          '[auth] Server sign-out failed; clearing local session anyway.',
          err instanceof Error ? err.message : err
        );
      }
    }
    writeWebSessionCache(null);
    await clearAuthCookie();
    clearApiAuth();
    resetClientStores();
    set({ session: null, loading: false, hydrated: false });
  },
}));

export { hasAuthCredentials };
