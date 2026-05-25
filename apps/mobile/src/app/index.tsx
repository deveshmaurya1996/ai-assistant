import '@/lib/auth-session';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/ui/Text';

export default function Index() {
  const { colors } = useTheme();
  const { session, loading, hydrate } = useAuthStore();
  const settingsReady = useSettingsStore((s) => s.hydrated);
  const navigationState = useRootNavigationState();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!navigationState?.key) return;
    if (loading || !settingsReady) return;

    if (session) {
      router.replace('/(app)/(main)/chats');
    } else {
      router.replace('/(auth)/welcome');
    }
  }, [navigationState?.key, loading, settingsReady, session]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
        gap: 16,
      }}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text variant="body" muted>
        Loading…
      </Text>
    </View>
  );
}
