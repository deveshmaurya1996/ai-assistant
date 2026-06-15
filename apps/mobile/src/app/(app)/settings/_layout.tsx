import { Stack } from 'expo-router';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';

export default function SettingsLayout() {
  const screenOptions = useThemedScreenOptions();

  return (
    <Stack
      screenOptions={{
        ...screenOptions,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    />
  );
}
