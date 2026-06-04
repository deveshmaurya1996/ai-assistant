import { memo, useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { monoFontFamily } from './monoFont';
import { HighlightedCode } from './HighlightedCode';
import { formatCodeLanguageLabel } from './codeLanguage';
import { codeBlockContainerColor } from './markdownTheme';

const LONG_LINE_THRESHOLD = 80;

type Props = {
  content: string;
  language?: string;
  fullWidth?: boolean;
  preferHorizontalScroll?: boolean;
  showCursor?: boolean;
  cursorColor?: string;
};

export const CodeBlock = memo(function CodeBlock({
  content,
  language,
  fullWidth = false,
  preferHorizontalScroll = false,
  showCursor = false,
  cursorColor,
}: Props) {
  const { colors, isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const langLabel = formatCodeLanguageLabel(language);
  const showLang = Boolean(langLabel);
  const codeBg = codeBlockContainerColor(isDark);

  const needsHorizontalScroll = useMemo(
    () =>
      preferHorizontalScroll ||
      content.split('\n').some((line) => line.length > LONG_LINE_THRESHOLD),
    [content, preferHorizontalScroll]
  );

  const handleCopy = useCallback(async () => {
    if (!content) return;
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const body = needsHorizontalScroll ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      nestedScrollEnabled
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}>
      <HighlightedCode
        content={content}
        language={language}
        showCursor={showCursor}
        cursorColor={cursorColor}
      />
    </ScrollView>
  ) : (
    <HighlightedCode
      content={content}
      language={language}
      showCursor={showCursor}
      cursorColor={cursorColor}
    />
  );

  return (
    <View
      style={[
        styles.container,
        fullWidth && styles.containerFullWidth,
        { backgroundColor: codeBg, borderColor: colors.border },
      ]}>
      <View style={styles.header}>
        {showLang ? (
          <RNText style={[styles.lang, { color: colors.textMuted, fontFamily: monoFontFamily }]}>
            {langLabel}
          </RNText>
        ) : (
          <View />
        )}
        <Pressable onPress={() => void handleCopy()} hitSlop={8} accessibilityLabel="Copy code">
          {copied ? (
            <Check color={colors.success} size={16} />
          ) : (
            <Copy color={colors.textMuted} size={16} />
          )}
        </Pressable>
      </View>
      {body}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginVertical: spacing.xs,
    padding: spacing.sm,
    gap: spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      // android: { elevation: 1 },
      default: {},
    }),
  },
  containerFullWidth: {
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  lang: {
    fontSize: 11,
    textTransform: 'lowercase',
  },
  scroll: {
    backgroundColor: 'transparent',
    flexGrow: 0,
  },
  scrollContent: {
    flexGrow: 0,
    flexShrink: 0,
  },
});
