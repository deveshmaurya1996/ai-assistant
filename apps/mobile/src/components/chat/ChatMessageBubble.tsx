import { View, StyleSheet, ActivityIndicator } from 'react-native';
import type { ChatMessage } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { STREAMING_MESSAGE_ID } from '@/features/chat/buildStreamingMessages';

type Props = {
  message: ChatMessage;
  showGeneratingSpinner?: boolean;
  showStreamCursor?: boolean;
};

function isUserMessage(message: ChatMessage): boolean {
  return message.role === 'USER';
}

export function ChatMessageBubble({
  message,
  showGeneratingSpinner = false,
  showStreamCursor = false,
}: Props) {
  const { colors } = useTheme();
  const isUser = isUserMessage(message);
  const isStreamingBubble = message.id === STREAMING_MESSAGE_ID;
  const showSpinner =
    isStreamingBubble && !message.content && showGeneratingSpinner;
  const showCursor = isStreamingBubble && showStreamCursor && Boolean(message.content);

  return (
    <View
      style={[
        styles.bubble,
        {
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          backgroundColor: isUser ? colors.primary : colors.surfaceElevated,
          borderColor: colors.border,
          borderWidth: isUser ? 0 : 1,
        },
      ]}>
      {showSpinner ? (
        <ActivityIndicator color={colors.textMuted} />
      ) : (
        <Text style={{ color: isUser ? colors.onPrimary : colors.text }}>
          {message.content}
          {showCursor ? (
            <Text style={{ color: colors.primary }}>|</Text>
          ) : null}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    padding: spacing.md,
    borderRadius: radii.lg,
    maxWidth: '85%',
    marginBottom: spacing.sm,
  },
});
