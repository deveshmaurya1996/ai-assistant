import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';

export default function Index() {
  const { colors } = useTheme();
  const { session, loading, hydrate } = useAuthStore();
  const settingsReady = useSettingsStore((s) => s.hydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (loading || !settingsReady) return;
    if (session) {
      router.replace('/(app)/(main)/chats');
    } else {
      router.replace('/(auth)/welcome');
    }
  }, [loading, settingsReady, session]);

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
