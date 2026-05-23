import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/tokens';

type Variant = keyof typeof typography;

type Props = RNTextProps & {
  variant?: Variant;
  muted?: boolean;
  color?: string;
};

export function Text({ variant = 'body', muted, color, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        typography[variant],
        { color: color ?? (muted ? colors.textMuted : colors.text) },
        style,
      ]}
      {...rest}
    />
  );
}
