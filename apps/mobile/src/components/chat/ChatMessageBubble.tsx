import { memo, useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
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
import { ShareActionsRow } from '@/components/share/ShareActionsRow';
import {
  downloadImageToDevice,
  firstImageAttachment,
  shareAssistantMessage,
} from '@/lib/share';

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
  const imageAttachment = useMemo(() => firstImageAttachment(message), [message]);
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
  const canSave = !isUser && canCopy && Boolean(onSaveNote);
  const showUserCopy = isUser && canCopy;
  const showAssistantActions = !isUser && !isStreamingBubble;
  const showImageDownload = showAssistantActions && Boolean(imageAttachment);
  const showShare =
    showAssistantActions &&
    (Boolean(message.content?.trim()) || Boolean(imageAttachment));
  const showActions =
    showUserCopy ||
    (showAssistantActions && (canCopy || canSave || showShare || showImageDownload));

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
                  allowImageExport={false}
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
                  allowImageExport
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
      {showActions ? (
        <ShareActionsRow
          align={isUser ? 'right' : 'left'}
          copy={canCopy ? { text: message.content } : undefined}
          save={
            canSave && onSaveNote
              ? {
                  isSaved,
                  onPress: () => onSaveNote(message.content, message.id),
                }
              : undefined
          }
          download={
            showImageDownload && imageAttachment
              ? {
                  onPress: () =>
                    downloadImageToDevice(
                      imageAttachment.id,
                      imageAttachment.filename,
                      imageAttachment.mimeType
                    ),
                }
              : undefined
          }
          share={
            showShare
              ? {
                  onPress: () => shareAssistantMessage(message),
                }
              : undefined
          }
        />
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
});
