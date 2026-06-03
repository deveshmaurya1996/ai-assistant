import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Routes } from '@/lib/routes';

const GUEST_ONLY_SCREENS = new Set(['welcome', 'login', 'register']);

export default function AuthLayout() {
  const { colors } = useTheme();
  const segments = useSegments();
  const { session, loading, hydrate } = useAuthStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const currentScreen = segments[segments.length - 1];
  const isGuestOnlyScreen = GUEST_ONLY_SCREENS.has(currentScreen);

  if (loading) {
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

  if (session && isGuestOnlyScreen) {
    return <Redirect href={Routes.chatCompose} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
