import { memo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Bookmark, Check, Copy } from 'lucide-react-native';
import type { ChatAttachmentRef } from '@ai-assistant/sdk';
import type { ChatMessage } from '@ai-assistant/types/chat';
import { LEGACY_ASSISTANT_LABEL } from '@/features/chat/chatRoutes';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { STREAMING_MESSAGE_ID } from '@/features/chat/buildStreamingMessages';
import { ChatThinkingIndicator } from './ChatThinkingIndicator';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatMessageAttachments } from './ChatMessageAttachments';
import { ChatStreamingText } from './ChatStreamingText';
import { fitChatImageDimensions } from './fitChatImageDimensions';
import { ChatImageSkeleton } from './ChatImageSkeleton';
import { GENERATED_IMAGE_SIZE } from '@/features/chat/isImageGenerationTurn';

type Props = {
  message: ChatMessage;
  assistantLabel?: string;
  showGeneratingSpinner?: boolean;
  showStreamCursor?: boolean;
  streamActive?: boolean;
  streamTurnKey?: number;
  thinkingUserMessage?: string;
  streamStatusMessage?: string | null;
  showImageSkeleton?: boolean;
  isSaved?: boolean;
  onSaveNote?: (content: string, messageId: string) => Promise<void>;
  onEditImage?: (attachment: ChatAttachmentRef) => void;
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
  streamStatusMessage,
  showImageSkeleton = false,
  isSaved = false,
  onSaveNote,
  onEditImage,
}: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isUser = isUserMessage(message);
  const bubbleMaxWidth = Math.round(windowWidth * 0.85);
  const assistantBorder = isUser ? 0 : 1;
  const imageMaxWidth = bubbleMaxWidth - assistantBorder * 2;
  const hasAttachments = Boolean(message.attachments?.length);
  const hasText = Boolean(message.content?.trim());
  const imageBubbleFullWidth = hasAttachments || showImageSkeleton;
  const imageSkeletonSize = fitChatImageDimensions(
    GENERATED_IMAGE_SIZE.width,
    GENERATED_IMAGE_SIZE.height,
    imageMaxWidth,
    320,
    true
  );
  const assistantWrapWidth = bubbleMaxWidth;
  const isStreamingBubble = message.id === STREAMING_MESSAGE_ID;
  const hasStreamContent = Boolean(message.content?.trim());
  const showThinking =
    isStreamingBubble &&
    !hasStreamContent &&
    !showImageSkeleton &&
    (showGeneratingSpinner || streamActive);
  const streamLive =
    isStreamingBubble &&
    hasStreamContent &&
    (streamActive || showStreamCursor);
  const canCopy =
    Boolean(message.content.trim()) &&
    !isStreamingBubble &&
    !message.id.startsWith('local-');
  const canSave =
    !isUser && canCopy && Boolean(onSaveNote);

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
        imageBubbleFullWidth && { width: bubbleMaxWidth, maxWidth: bubbleMaxWidth },
        !isUser && !imageBubbleFullWidth && { width: assistantWrapWidth, maxWidth: assistantWrapWidth },
      ]}>
      {!isUser && assistantLabel ? (
        <Text variant="caption" muted style={styles.assistantLabel}>
          {assistantLabel}
        </Text>
      ) : null}
      {isStreamingBubble && showThinking ? (
        <ChatThinkingIndicator
          userMessage={thinkingUserMessage}
          statusOverride={streamStatusMessage}
        />
      ) : null}
      {isUser || !isStreamingBubble || hasStreamContent || showImageSkeleton ? (
        <View
          style={[
            styles.bubble,
            imageBubbleFullWidth && styles.imageBubble,
            {
              backgroundColor: isUser ? colors.primary : colors.surfaceElevated,
              borderColor: colors.border,
              borderWidth: isUser ? 0 : 1,
            },
          ]}>
          {isUser ? (
            <>
              {hasAttachments ? (
                <ChatMessageAttachments
                  attachments={message.attachments!}
                  maxImageWidth={imageMaxWidth}
                  fillWidth
                />
              ) : null}
              {hasText ? (
                <View
                  style={[
                    styles.bubbleText,
                    hasAttachments ? styles.bubbleTextAfterImage : null,
                  ]}>
                  <Text style={{ color: colors.onPrimary }}>{message.content}</Text>
                </View>
              ) : null}
            </>
          ) : isStreamingBubble ? (
            <>
              {showImageSkeleton ? (
                <ChatImageSkeleton
                  width={imageSkeletonSize.width}
                  height={imageSkeletonSize.height}
                  fillWidth
                />
              ) : null}
              {hasStreamContent ? (
                <View
                  style={[
                    styles.bubbleText,
                    showImageSkeleton ? styles.bubbleTextAfterImage : null,
                  ]}>
                  <ChatStreamingText
                    content={message.content}
                    color={colors.text}
                    accentColor={colors.primary}
                    showCursor={streamLive}
                    cursorColor={colors.primary}
                    revealActive={streamActive}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <>
              {hasAttachments ? (
                <ChatMessageAttachments
                  attachments={message.attachments!}
                  onEditImage={onEditImage}
                  maxImageWidth={imageMaxWidth}
                  fillWidth
                />
              ) : null}
              {hasText ? (
                <View
                  style={[
                    styles.bubbleText,
                    hasAttachments ? styles.bubbleTextAfterImage : null,
                  ]}>
                  <ChatMarkdown
                    content={message.content}
                    color={colors.text}
                    accentColor={colors.primary}
                  />
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
      {canCopy || canSave ? (
        <View style={[styles.actions, isUser && styles.actionsUser]}>
          {canCopy ? (
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
          ) : null}
          {canSave ? (
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
          ) : null}
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
      prev.streamStatusMessage === next.streamStatusMessage &&
      prev.showImageSkeleton === next.showImageSkeleton &&
      prev.thinkingUserMessage === next.thinkingUserMessage &&
      prev.assistantLabel === next.assistantLabel
    );
  }
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.attachments?.length === next.message.attachments?.length &&
    (prev.message.assistantDisplayName ?? LEGACY_ASSISTANT_LABEL) ===
      (next.message.assistantDisplayName ?? LEGACY_ASSISTANT_LABEL) &&
    prev.isSaved === next.isSaved &&
    prev.assistantLabel === next.assistantLabel &&
    prev.onSaveNote === next.onSaveNote &&
    prev.onEditImage === next.onEditImage
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleInner, bubblePropsEqual);

const styles = StyleSheet.create({
  wrap: {
    maxWidth: '85%',
    marginBottom: spacing.sm,
    flexGrow: 0,
    flexShrink: 1,
  },
  assistantLabel: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  bubble: {
    borderRadius: radii.lg,
    flexGrow: 0,
    flexShrink: 1,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  bubbleText: {
    padding: spacing.md,
  },
  bubbleTextAfterImage: {
    paddingTop: spacing.sm,
    alignSelf: 'stretch',
  },
  imageBubble: {
    width: '100%',
    minWidth: 0,
    alignItems: 'stretch',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  actionsUser: {
    alignSelf: 'flex-end',
    marginLeft: 0,
    marginRight: spacing.xs,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
