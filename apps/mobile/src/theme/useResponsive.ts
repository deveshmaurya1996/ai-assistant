import { useMemo } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import { layout, spacing } from './tokens';

export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = width >= 768;
    const isCompact = width < 360;
    const horizontalPadding = isTablet ? spacing.lg : isCompact ? spacing.md : spacing.md;
    const scale = Math.min(Math.max(width / 390, 0.85), 1.15);

    return {
      width,
      height,
      fontScale,
      pixelDensity: PixelRatio.get(),
      isTablet,
      isCompact,
      horizontalPadding,
      contentMaxWidth: layout.maxContentWidth,
      dockBottomOffset: layout.dockBottomOffset,
      scale,
      fontSize: (base: number) => Math.round(base * scale * (fontScale > 1.2 ? 1.05 : 1)),
    };
  }, [width, height, fontScale]);
}
