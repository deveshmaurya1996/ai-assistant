import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { FileText, X } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import type { PendingAttachment } from '@/features/chat/useChatAttachments';
import { openChatLocalImagePreview } from '@/features/chat/imagePreviewStore';

type Props = {
  items: PendingAttachment[];
  onRemove: (localId: string) => void;
};

const CHIP_SIZE = 64;
const REMOVE_SIZE = 22;

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
        <View key={item.localId} style={styles.chipSlot}>
          <View
            style={[
              styles.chip,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: item.error ? colors.danger : colors.border,
              },
            ]}>
            {item.kind === 'image' ? (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => openChatLocalImagePreview(item.uri, item.filename)}
                accessibilityRole="imagebutton"
                accessibilityLabel="Preview attached image">
                <Image source={{ uri: item.uri }} style={styles.media} contentFit="cover" />
              </Pressable>
            ) : (
              <View style={[styles.fileIcon, { backgroundColor: colors.primaryMuted }]}>
                <FileText color={colors.primary} size={22} />
              </View>
            )}

            {item.uploading ? (
              <View style={styles.overlay}>
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            ) : null}

            {item.error ? (
              <View style={[styles.errorOverlay, { backgroundColor: `${colors.danger}33` }]} />
            ) : null}

            <Pressable
              onPress={() => onRemove(item.localId)}
              style={[
                styles.remove,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
              hitSlop={6}
              accessibilityLabel="Remove attachment">
              <X color={colors.textMuted} size={13} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 0,
    marginBottom: spacing.xs,
  },
  scroll: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  chipSlot: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
  },
  chip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  fileIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: REMOVE_SIZE,
    height: REMOVE_SIZE,
    borderRadius: REMOVE_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
