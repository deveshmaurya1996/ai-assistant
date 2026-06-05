import { Stack } from 'expo-router';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';

export default function AutomationsLayout() {
  const screenOptions = useThemedScreenOptions();
  return <Stack screenOptions={screenOptions} />;
}
