import { useMemo } from 'react';
import { useTheme } from './ThemeProvider';

export function useThemedScreenOptions() {
  const { colors } = useTheme();

  return useMemo(
    () => ({
      headerShown: false as const,
      contentStyle: { backgroundColor: colors.background },
      sceneContainerStyle: { backgroundColor: colors.background },
    }),
    [colors.background]
  );
}
