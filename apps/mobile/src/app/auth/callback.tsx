import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import {
  applyOAuthCookieFromUrl,
  applyOAuthCookieParam,
} from '@/lib/auth-cookies';
import { fetchVerifiedSessionWithRetry } from '@/lib/auth-session';
import { hydrateAuthStorage } from '@/lib/secure-storage';
import { useAuthStore } from '@/stores/auth';
import { writeWebSessionCache } from '@/lib/web-session-cache';
import { AppSplash } from '@/components/boot/AppSplash';
import { Routes } from '@/lib/routes';

async function applyOAuthCredentials(
  incomingUrl: string | null,
  cookieParam?: string
): Promise<void> {
  await hydrateAuthStorage();

  if (typeof cookieParam === 'string' && cookieParam.length > 0) {
    await applyOAuthCookieParam(cookieParam);
    return;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    await applyOAuthCookieFromUrl(window.location.href);
    return;
  }

  if (incomingUrl) {
    await applyOAuthCookieFromUrl(incomingUrl);
  }
}

async function resolveOAuthSession(): Promise<boolean> {
  const session = await fetchVerifiedSessionWithRetry();
  if (session) {
    if (Platform.OS === 'web') writeWebSessionCache(session);
    useAuthStore.setState({ session, loading: false, hydrated: true });
    router.replace(Routes.chatCompose);
    return true;
  }

  const hydrated = await useAuthStore.getState().hydrate();
  if (hydrated) {
    router.replace(Routes.chatCompose);
    return true;
  }

  return false;
}

function hasOAuthSignal(incomingUrl: string | null, cookieParam?: string): boolean {
  if (typeof cookieParam === 'string' && cookieParam.length > 0) return true;
  if (!incomingUrl) return false;
  try {
    return new URL(incomingUrl).searchParams.has('cookie');
  } catch {
    return incomingUrl.includes('cookie=');
  }
}

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ cookie?: string }>();
  const completedRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const finish = async (incomingUrl: string | null) => {
      if (completedRef.current || inFlightRef.current) return;

      const cookieParam =
        typeof params.cookie === 'string' ? params.cookie : undefined;
      if (Platform.OS === 'android' && !hasOAuthSignal(incomingUrl, cookieParam)) {
        return;
      }

      inFlightRef.current = true;

      try {
        await applyOAuthCredentials(incomingUrl, cookieParam);
        const ok = await resolveOAuthSession();
        if (ok) {
          completedRef.current = true;
          return;
        }
      } finally {
        inFlightRef.current = false;
      }

      if (!completedRef.current && !useAuthStore.getState().session) {
        router.replace('/(auth)/login');
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      void finish(window.location.href);
      return;
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void finish(url);
    });

    if (Platform.OS === 'android') {
      if (hasOAuthSignal(null, typeof params.cookie === 'string' ? params.cookie : undefined)) {
        void finish(null);
      }
    } else {
      void Linking.getInitialURL().then((url) => finish(url));
    }

    return () => subscription.remove();
  }, [params.cookie]);

  return <AppSplash />;
}
