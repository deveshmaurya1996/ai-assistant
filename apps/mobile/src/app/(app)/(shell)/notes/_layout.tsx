import { Stack } from 'expo-router';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';

export default function NotesLayout() {
  const screenOptions = useThemedScreenOptions();
  return <Stack screenOptions={screenOptions} />;
}
