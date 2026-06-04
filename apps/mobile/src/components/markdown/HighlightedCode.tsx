import { memo, useMemo } from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { InlineStreamingCursor } from '@/components/chat/StreamingCursor';
import { useTheme } from '@/theme/ThemeProvider';
import { codeTokenColors } from './codeTheme';
import { monoFontFamily } from './monoFont';
import { tokenizeCode } from './tokenizeCode';

type Props = {
  content: string;
  language?: string;
  showCursor?: boolean;
  cursorColor?: string;
};

export const HighlightedCode = memo(function HighlightedCode({
  content,
  language,
  showCursor = false,
  cursorColor,
}: Props) {
  const { colorScheme } = useTheme();
  const palette = codeTokenColors[colorScheme];
  const tokens = useMemo(() => tokenizeCode(content, language), [content, language]);

  return (
    <RNText style={[styles.code, { fontFamily: monoFontFamily }]} selectable>
      {tokens.map((token, i) => (
        <RNText key={`${i}-${token.kind}`} style={{ color: palette[token.kind] }}>
          {token.text}
        </RNText>
      ))}
      {showCursor && cursorColor ? <InlineStreamingCursor color={cursorColor} /> : null}
    </RNText>
  );
});

const styles = StyleSheet.create({
  code: {
    fontSize: 13,
    lineHeight: 20,
    flexShrink: 0,
  },
});
