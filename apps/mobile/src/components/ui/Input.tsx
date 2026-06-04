import { forwardRef } from 'react';
import { TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';

export const Input = forwardRef<TextInput, TextInputProps>(function Input(
  { style, ...props },
  ref
) {
  const { colors, colorScheme } = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textMuted}
      keyboardAppearance={colorScheme === 'dark' ? 'dark' : 'light'}
      selectionColor={colors.primary}
      style={[
        styles.input,
        typography.body,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          color: colors.text,
        },
        style,
      ]}
      {...props}
    />
  );
});

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
});
