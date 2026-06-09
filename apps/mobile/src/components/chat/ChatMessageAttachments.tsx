import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ImageLoadEventData } from 'expo-image';
import { FileText, Pencil } from 'lucide-react-native';
import type { ChatAttachmentRef } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { AuthenticatedChatImage } from './AuthenticatedChatImage';
import { fitChatImageDimensions } from './fitChatImageDimensions';
import { spacing, radii } from '@/theme/tokens';

const EDIT_BTN_SIZE = 28;
const IMAGE_MAX_HEIGHT = 320;

type ImageAttachmentProps = {
  attachment: ChatAttachmentRef;
  maxWidth: number;
  onEditImage?: (attachment: ChatAttachmentRef) => void;
  fillWidth?: boolean;
  allowExport?: boolean;
};

function ChatImageAttachment({
  attachment,
  maxWidth,
  onEditImage,
  fillWidth = false,
  allowExport = false,
}: ImageAttachmentProps) {
  const { colors } = useTheme();
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);

  const size = useMemo(
    () =>
      dims ??
      fitChatImageDimensions(maxWidth, maxWidth * 0.75, maxWidth, IMAGE_MAX_HEIGHT, fillWidth),
    [dims, fillWidth, maxWidth]
  );

  const frameStyle = useMemo(
    () =>
      fillWidth
        ? { width: '100%' as const, height: size.height }
        : { width: size.width, height: size.height },
    [fillWidth, size.height, size.width]
  );

  const handleLoad = (event: ImageLoadEventData) => {
    const { width, height } = event.source;
    const next = fitChatImageDimensions(width, height, maxWidth, IMAGE_MAX_HEIGHT, fillWidth);
    setDims((prev) =>
      prev?.width === next.width && prev?.height === next.height ? prev : next
    );
  };

  return (
    <View
      style={[
        styles.imageWrap,
        fillWidth ? styles.imageWrapFill : null,
        fillWidth ? { height: size.height } : { width: size.width, height: size.height },
      ]}>
      <AuthenticatedChatImage
        fileId={attachment.id}
        filename={attachment.filename}
        mimeType={attachment.mimeType}
        allowExport={allowExport}
        style={frameStyle}
        contentFit={fillWidth ? 'cover' : 'contain'}
        onLoad={handleLoad}
      />
      {onEditImage ? (
        <Pressable
          onPress={() => onEditImage(attachment)}
          style={[
            styles.editBtn,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
          hitSlop={6}
          accessibilityLabel="Edit image">
          <Pencil color={colors.primary} size={14} strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  );
}

type Props = {
  attachments: ChatAttachmentRef[];
  onEditImage?: (attachment: ChatAttachmentRef) => void;
  maxImageWidth?: number;
  fillWidth?: boolean;
  allowImageExport?: boolean;
};

export function ChatMessageAttachments({
  attachments,
  onEditImage,
  maxImageWidth,
  fillWidth = false,
  allowImageExport = false,
}: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const imageMaxWidth = maxImageWidth ?? Math.round(windowWidth * 0.68);

  if (!attachments.length) return null;

  const hasImage = attachments.some((att) => att.kind === 'image');

  return (
    <View style={[styles.wrap, fillWidth ? styles.wrapFill : null, !hasImage ? styles.wrapPadded : null]}>
      {attachments.map((att) => {
        if (att.kind === 'image') {
          return (
            <ChatImageAttachment
              key={att.id}
              attachment={att}
              maxWidth={imageMaxWidth}
              onEditImage={onEditImage}
              fillWidth={fillWidth}
              allowExport={allowImageExport}
            />
          );
        }
        return (
          <View
            key={att.id}
            style={[styles.fileRow, { backgroundColor: colors.primaryMuted }]}>
            <FileText color={colors.primary} size={16} />
            <Text variant="caption" numberOfLines={1} style={{ color: colors.primary, flex: 1 }}>
              {att.filename}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    gap: spacing.xs,
  },
  wrapFill: {
    alignItems: 'stretch',
  },
  wrapPadded: {
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  imageWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  imageWrapFill: {
    width: '100%',
    alignSelf: 'stretch',
  },
  editBtn: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: EDIT_BTN_SIZE,
    height: EDIT_BTN_SIZE,
    borderRadius: EDIT_BTN_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
});
