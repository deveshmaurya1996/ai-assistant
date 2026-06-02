import { memo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Bookmark, Check, Copy } from 'lucide-react-native';
import type { ChatMessage } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { STREAMING_MESSAGE_ID } from '@/features/chat/buildStreamingMessages';
import { ChatThinkingIndicator } from './ChatThinkingIndicator';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatMessageAttachments } from './ChatMessageAttachments';
import { ChatStreamingText } from './ChatStreamingText';

type Props = {
  message: ChatMessage;
  assistantLabel?: string;
  showGeneratingSpinner?: boolean;
  showStreamCursor?: boolean;
  streamActive?: boolean;
  streamTurnKey?: number;
  thinkingUserMessage?: string;
  isSaved?: boolean;
  onSaveNote?: (content: string, messageId: string) => Promise<void>;
};

function isUserMessage(message: ChatMessage): boolean {
  return message.role === 'USER';
}

function ChatMessageBubbleInner({
  message,
  assistantLabel,
  showGeneratingSpinner = false,
  showStreamCursor = false,
  streamActive = false,
  thinkingUserMessage,
  isSaved = false,
  onSaveNote,
}: Props) {
  const { colors } = useTheme();
  const isUser = isUserMessage(message);
  const isStreamingBubble = message.id === STREAMING_MESSAGE_ID;
  const showSpinner =
    isStreamingBubble && !message.content && showGeneratingSpinner;
  const streamLive = isStreamingBubble && (streamActive || showStreamCursor);
  const canActOnAssistant =
    !isUser &&
    !isStreamingBubble &&
    Boolean(message.content.trim()) &&
    Boolean(onSaveNote) &&
    !message.id.startsWith('local-');

  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCopy = async () => {
    if (!message.content.trim()) return;
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleSave = async () => {
    if (!onSaveNote || !message.content.trim() || saving) return;
    setSaving(true);
    try {
      await onSaveNote(message.content, message.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      style={[
        styles.wrap,
        { alignSelf: isUser ? 'flex-end' : 'flex-start' },
      ]}>
      {!isUser && assistantLabel ? (
        <Text variant="caption" muted style={styles.assistantLabel}>
          {assistantLabel}
        </Text>
      ) : null}
      {showSpinner ? (
        <ChatThinkingIndicator
          userMessage={thinkingUserMessage}
          assistantLabel={assistantLabel}
        />
      ) : (
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isUser ? colors.primary : colors.surfaceElevated,
              borderColor: colors.border,
              borderWidth: isUser ? 0 : 1,
            },
          ]}>
          {isUser ? (
            <>
              {message.attachments?.length ? (
                <ChatMessageAttachments attachments={message.attachments} />
              ) : null}
              {message.content ? (
                <Text style={{ color: colors.onPrimary }}>{message.content}</Text>
              ) : null}
            </>
          ) : isStreamingBubble ? (
            <ChatStreamingText
              content={message.content}
              color={colors.text}
              showCursor={streamLive}
              cursorColor={colors.primary}
            />
          ) : (
            <ChatMarkdown
              content={message.content}
              color={colors.text}
              accentColor={colors.primary}
            />
          )}
        </View>
      )}
      {canActOnAssistant ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => void handleCopy()}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}
            accessibilityLabel="Copy message">
            {copied ? (
              <Check color={colors.success} size={16} />
            ) : (
              <Copy color={colors.textMuted} size={16} />
            )}
          </Pressable>
          <Pressable
            onPress={() => void handleToggleSave()}
            disabled={saving}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}
            accessibilityLabel={isSaved ? 'Remove from notes' : 'Save to notes'}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Bookmark
                color={isSaved ? colors.primary : colors.textMuted}
                fill={isSaved ? colors.primary : 'transparent'}
                size={16}
              />
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function bubblePropsEqual(prev: Props, next: Props): boolean {
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.id === STREAMING_MESSAGE_ID) {
    return (
      prev.message.content === next.message.content &&
      prev.showGeneratingSpinner === next.showGeneratingSpinner &&
      prev.showStreamCursor === next.showStreamCursor &&
      prev.streamActive === next.streamActive &&
      prev.thinkingUserMessage === next.thinkingUserMessage &&
      prev.assistantLabel === next.assistantLabel
    );
  }
  return (
    prev.message === next.message &&
    prev.isSaved === next.isSaved &&
    prev.assistantLabel === next.assistantLabel &&
    prev.onSaveNote === next.onSaveNote
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleInner, bubblePropsEqual);

const styles = StyleSheet.create({
  wrap: {
    maxWidth: '85%',
    marginBottom: spacing.sm,
  },
  assistantLabel: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  bubble: {
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
