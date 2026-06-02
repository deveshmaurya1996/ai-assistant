import { StyleSheet, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import type { ChatAttachmentRef } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { AuthenticatedChatImage } from './AuthenticatedChatImage';
import { spacing, radii } from '@/theme/tokens';

type Props = {
  attachments: ChatAttachmentRef[];
};

export function ChatMessageAttachments({ attachments }: Props) {
  const { colors } = useTheme();

  if (!attachments.length) return null;

  return (
    <View style={styles.wrap}>
      {attachments.map((att) => {
        if (att.kind === 'image') {
          return (
            <AuthenticatedChatImage
              key={att.id}
              fileId={att.id}
              filename={att.filename}
              style={[styles.image, { backgroundColor: colors.surface }]}
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
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  image: {
    width: 200,
    height: 150,
    borderRadius: radii.md,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    maxWidth: 220,
  },
});
