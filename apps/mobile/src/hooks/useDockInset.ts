import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout } from '@/theme/tokens';

const DOCK_RING_MARGIN = 6;

export const ASSISTANT_ACTIVE_FOOTER_HEIGHT = 148;

export function useDockInset() {
  const insets = useSafeAreaInsets();
  const bottom =
    Math.max(insets.bottom, layout.dockBottomOffset) +
    layout.dockHeight +
    DOCK_RING_MARGIN;

  return {
    bottom,
    contentBottom: bottom + ASSISTANT_ACTIVE_FOOTER_HEIGHT,
  };
}
