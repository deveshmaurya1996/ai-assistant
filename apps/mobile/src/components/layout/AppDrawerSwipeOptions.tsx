import { useWindowDimensions } from 'react-native';
import type { PanGesture } from 'react-native-gesture-handler';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';
import { useTheme } from '@/theme/ThemeProvider';

export function useAppDrawerScreenOptions() {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const screenOptions = useThemedScreenOptions();

  return {
    ...screenOptions,
    drawerType: 'front' as const,
    drawerStyle: { backgroundColor: colors.background, width: 320 },
    overlayColor: colors.overlay,
    drawerContentContainerStyle: { flex: 1, backgroundColor: colors.background },
    swipeEnabled: true,
    swipeEdgeWidth: width,
    swipeMinDistance: 12,
    keyboardDismissMode: 'on-drag' as const,
    configureGestureHandler: (gesture: PanGesture) =>
      gesture.activeOffsetX([-24, 24]).failOffsetY([-12, 12]),
  };
}
