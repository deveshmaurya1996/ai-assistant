import { Redirect } from 'expo-router';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { AppSplash } from '@/components/boot/AppSplash';
import { Routes } from '@/lib/routes';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';

export default function AppLayout() {
  const { session, loading } = useAuthStore();
  const screenOptions = useThemedScreenOptions();

  if (loading) {
    return <AppSplash />;
  }

  if (!session) {
    return <Redirect href={Routes.welcome} />;
  }

  return (
    <Stack screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="(shell)" options={{ animation: 'none' }} />
      <Stack.Screen
        name="settings"
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}
