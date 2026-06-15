import { Stack } from 'expo-router';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';

export default function IntegrationsLayout() {
  const screenOptions = useThemedScreenOptions();
  return <Stack screenOptions={screenOptions} />;
}
