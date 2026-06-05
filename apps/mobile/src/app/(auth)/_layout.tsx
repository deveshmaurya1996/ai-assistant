import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { Routes } from '@/lib/routes';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';

const GUEST_ONLY_SCREENS = new Set(['welcome', 'login', 'register']);

export default function AuthLayout() {
  const screenOptions = useThemedScreenOptions();
  const segments = useSegments();
  const { session, loading } = useAuthStore();

  const currentScreen = segments[segments.length - 1];
  const isGuestOnlyScreen = GUEST_ONLY_SCREENS.has(currentScreen);

  if (loading) {
    return null;
  }

  if (session && isGuestOnlyScreen) {
    return <Redirect href={Routes.chatCompose} />;
  }

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
