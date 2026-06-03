import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/theme/tokens';

export const ASSISTANT_ACTIVE_FOOTER_HEIGHT = 148;

export function useDockInset() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, spacing.sm);

  return {
    bottom,
    contentBottom: bottom + ASSISTANT_ACTIVE_FOOTER_HEIGHT,
  };
}
