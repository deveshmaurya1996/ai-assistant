import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { AppMarkdown } from '@/components/markdown/AppMarkdown';
import { InlineStreamingCursor } from '@/components/chat/StreamingCursor';
import { Text } from '@/components/ui/Text';

type Props = {
  content: string;
  color: string;
  accentColor?: string;
  showCursor?: boolean;
  cursorColor?: string;
  revealActive?: boolean;
};

export const ChatStreamingText = memo(function ChatStreamingText({
  content,
  color,
  accentColor,
  showCursor = false,
  cursorColor,
  revealActive = true,
}: Props) {
  const accent = accentColor ?? color;
  const showContent = Boolean(content.trim()) || showCursor;

  if (!showContent) {
    return null;
  }

  if (revealActive) {
    return (
      <Text variant="body" style={[styles.plain, { color }]}>
        {content}
        {showCursor && cursorColor ? (
          <InlineStreamingCursor color={cursorColor} />
        ) : null}
      </Text>
    );
  }

  return (
    <AppMarkdown
      content={content}
      color={color}
      accentColor={accent}
      variant="chat"
      streaming={false}
      showCursor={showCursor}
      cursorColor={cursorColor}
    />
  );
});

const styles = StyleSheet.create({
  plain: {
    flexShrink: 1,
  },
});
