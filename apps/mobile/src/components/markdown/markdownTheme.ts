import type { MarkdownStyle } from 'react-native-enriched-markdown';
import type { ThemeColors } from '@/theme/tokens';

export function codeSurfaceColor(colors: ThemeColors): string {
  return colors.surfaceElevated;
}

export function codeBlockContainerColor(isDark: boolean): string {
  return isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.06)';
}

export function buildMarkdownStyle(colors: ThemeColors, accentColor: string): MarkdownStyle {
  const codeBg = codeSurfaceColor(colors);

  return {
    paragraph: {
      fontSize: 16,
      lineHeight: 22,
      color: colors.text,
      marginTop: 0,
      marginBottom: 8,
    },
    h1: {
      fontSize: 22,
      lineHeight: 28,
      color: accentColor,
      marginTop: 8,
      marginBottom: 8,
    },
    h2: {
      fontSize: 18,
      lineHeight: 24,
      color: accentColor,
      marginTop: 8,
      marginBottom: 6,
    },
    h3: {
      fontSize: 16,
      lineHeight: 22,
      color: accentColor,
      marginTop: 6,
      marginBottom: 4,
    },
    strong: {
      color: accentColor,
    },
    em: {
      color: colors.text,
    },
    link: {
      color: accentColor,
      underline: true,
    },
    blockquote: {
      color: colors.textMuted,
      borderColor: colors.border,
      borderWidth: 3,
      gapWidth: 8,
      marginTop: 4,
      marginBottom: 8,
    },
    code: {
      fontSize: 14,
      color: colors.text,
      backgroundColor: codeBg,
      borderColor: colors.border,
    },
    codeBlock: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.text,
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      marginTop: 4,
      marginBottom: 4,
    },
    list: {
      color: colors.text,
      bulletColor: colors.textMuted,
      markerColor: colors.textMuted,
      marginTop: 4,
      marginBottom: 8,
    },
    table: {
      fontSize: 14,
      color: colors.text,
      borderColor: colors.border,
      borderRadius: 8,
      headerBackgroundColor: colors.surfaceElevated,
      cellPaddingHorizontal: 10,
      cellPaddingVertical: 8,
      marginTop: 8,
      marginBottom: 8,
    },
    thematicBreak: {
      color: colors.border,
      marginTop: 8,
      marginBottom: 8,
    },
  };
}
