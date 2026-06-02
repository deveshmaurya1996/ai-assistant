import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchSession } from '@/lib/auth-client';
import {
  applyOAuthCookieFromUrl,
  applyOAuthCookieParam,
} from '@/lib/auth-cookies';
import { useAuthStore } from '@/stores/auth';
import { writeWebSessionCache } from '@/lib/web-session-cache';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ cookie?: string }>();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    const finish = async (incomingUrl: string | null) => {
      if (handled.current) return;
      handled.current = true;

      if (typeof params.cookie === 'string' && params.cookie.length > 0) {
        await applyOAuthCookieParam(params.cookie);
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        await applyOAuthCookieFromUrl(window.location.href);
      } else {
        await applyOAuthCookieFromUrl(incomingUrl);
      }

      const session = await fetchSession();
      if (session) {
        if (Platform.OS === 'web') writeWebSessionCache(session);
        useAuthStore.setState({ session, loading: false });
        router.replace('/(app)/(main)/chats');
        return;
      }

      router.replace('/(auth)/login');
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      void finish(window.location.href);
      return;
    }

    void Linking.getInitialURL().then((url) => finish(url));

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handled.current = false;
      void finish(url);
    });

    return () => subscription.remove();
  }, [params.cookie]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
      }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
