import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { syncSessionToApiClient } from '@/lib/session-sync';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void (async () => {
      const session = await syncSessionToApiClient();
      if (session?.session) {
        useAuthStore.setState({ session, loading: false });
        router.replace('/(app)/(main)/chats');
        return;
      }
      await hydrate();
      const latest = useAuthStore.getState().session;
      if (latest?.session) {
        router.replace('/(app)/(main)/chats');
      } else {
        router.replace('/(auth)/login');
      }
    })();
  }, [hydrate]);

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
