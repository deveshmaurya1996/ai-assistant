import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { FileText, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import type { PendingAttachment } from '@/features/chat/useChatAttachments';
import { openChatLocalImagePreview } from '@/features/chat/imagePreviewStore';

type Props = {
  items: PendingAttachment[];
  onRemove: (localId: string) => void;
};

export function ChatAttachmentChips({ items, onRemove }: Props) {
  const { colors } = useTheme();

  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      style={styles.wrap}>
      {items.map((item) => (
        <View
          key={item.localId}
          style={[styles.chip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          {item.kind === 'image' ? (
            <Pressable
              onPress={() => openChatLocalImagePreview(item.uri, item.filename)}
              accessibilityRole="imagebutton"
              accessibilityLabel="Preview attached image">
              <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
            </Pressable>
          ) : (
            <View style={[styles.fileIcon, { backgroundColor: colors.primaryMuted }]}>
              <FileText color={colors.primary} size={20} />
            </View>
          )}
          {item.uploading ? (
            <View style={styles.overlay}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : null}
          <Pressable
            onPress={() => onRemove(item.localId)}
            style={[styles.remove, { backgroundColor: colors.surface }]}
            hitSlop={8}>
            <X color={colors.textMuted} size={14} />
          </Pressable>
          {item.error ? (
            <Text variant="caption" style={{ color: colors.danger, marginTop: 2 }} numberOfLines={1}>
              {item.error}
            </Text>
          ) : (
            <Text variant="caption" muted numberOfLines={1} style={styles.name}>
              {item.filename}
            </Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    maxHeight: 108,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  chip: {
    width: 72,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radii.sm,
  },
  fileIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radii.sm,
  },
  remove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 2,
    maxWidth: 64,
  },
});
