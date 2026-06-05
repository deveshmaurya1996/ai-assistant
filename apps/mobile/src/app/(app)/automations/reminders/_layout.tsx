import { Stack } from 'expo-router';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';

export default function RemindersLayout() {
  const screenOptions = useThemedScreenOptions();
  return <Stack screenOptions={screenOptions} />;
}
