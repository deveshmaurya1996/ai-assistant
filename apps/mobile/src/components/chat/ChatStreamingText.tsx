import { memo } from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { typography } from '@/theme/tokens';

type Props = {
  content: string;
  color: string;
  showCursor?: boolean;
  cursorColor?: string;
};

export const ChatStreamingText = memo(function ChatStreamingText({
  content,
  color,
  showCursor = false,
  cursorColor,
}: Props) {
  if (!content && !showCursor) {
    return null;
  }

  return (
    <RNText style={[typography.body, styles.text, { color }]}>
      {content}
      {showCursor && cursorColor ? (
        <RNText style={[styles.cursor, { color: cursorColor }]}>|</RNText>
      ) : null}
    </RNText>
  );
});

const styles = StyleSheet.create({
  text: {
    flexWrap: 'wrap',
  },
  cursor: {
    fontWeight: '600',
  },
});
