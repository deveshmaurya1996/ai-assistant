import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Bookmark, Check, Copy } from 'lucide-react-native';
import type { ChatMessage } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { STREAMING_MESSAGE_ID } from '@/features/chat/buildStreamingMessages';

type Props = {
  message: ChatMessage;
  showGeneratingSpinner?: boolean;
  showStreamCursor?: boolean;
  isSaved?: boolean;
  onSaveNote?: (content: string, messageId: string) => Promise<void>;
};

function isUserMessage(message: ChatMessage): boolean {
  return message.role === 'USER';
}

export function ChatMessageBubble({
  message,
  showGeneratingSpinner = false,
  showStreamCursor = false,
  isSaved = false,
  onSaveNote,
}: Props) {
  const { colors } = useTheme();
  const isUser = isUserMessage(message);
  const isStreamingBubble = message.id === STREAMING_MESSAGE_ID;
  const showSpinner =
    isStreamingBubble && !message.content && showGeneratingSpinner;
  const showCursor = isStreamingBubble && showStreamCursor && Boolean(message.content);
  const canActOnAssistant =
    !isUser &&
    !isStreamingBubble &&
    Boolean(message.content.trim()) &&
    Boolean(onSaveNote) &&
    !message.id.startsWith('local-');

  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(isSaved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSaved(isSaved);
  }, [isSaved]);

  const handleCopy = async () => {
    if (!message.content.trim()) return;
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!onSaveNote || !message.content.trim() || saving || saved) return;
    setSaving(true);
    try {
      await onSaveNote(message.content, message.id);
      setSaved(true);
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
      <View
        style={[
          styles.bubble,
          {
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
            onPress={() => void handleSave()}
            disabled={saving || saved}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceElevated }]}
            accessibilityLabel="Save to notes">
            <Bookmark
              color={saved ? colors.primary : colors.textMuted}
              fill={saved ? colors.primary : 'transparent'}
              size={16}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    maxWidth: '85%',
    marginBottom: spacing.sm,
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
