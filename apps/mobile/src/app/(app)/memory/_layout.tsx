import { Stack } from 'expo-router';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';

export default function MemoryLayout() {
  const screenOptions = useThemedScreenOptions();
  return <Stack screenOptions={screenOptions} />;
}
