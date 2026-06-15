import { forwardRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { AppBottomSheetModal, dismissBottomSheet, type BottomSheetModalType } from '@/lib/bottom-sheet';

type Props = {
  onCamera: () => void | Promise<void>;
  onPhotos: () => void | Promise<void>;
  onFiles: () => void | Promise<void>;
};

const ATTACHMENT_ICONS = {
  camera: { name: 'camera', color: '#3B82F6' },
  photos: { name: 'image-multiple', color: '#EC4899' },
  files: { name: 'file-document-outline', color: '#F97316' },
} as const;

export const ChatAttachmentPickerSheet = forwardRef<BottomSheetModalType, Props>(
  function ChatAttachmentPickerSheet({ onCamera, onPhotos, onFiles }, ref) {
    const { colors } = useTheme();

    const options = [
      { key: 'camera' as const, label: 'Camera', action: onCamera },
      { key: 'photos' as const, label: 'Photos', action: onPhotos },
      { key: 'files' as const, label: 'Files', action: onFiles },
    ];

    return (
      <AppBottomSheetModal
        ref={ref}
        snapPoints={['35%']}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundStyle={{ backgroundColor: colors.surface }}>
        <BottomSheetView style={styles.content}>
          <Text variant="h2" style={styles.title}>
            Add to message
          </Text>
          {options.map((option) => {
            const icon = ATTACHMENT_ICONS[option.key];
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  void option.action();
                  dismissBottomSheet(ref);
                }}
                style={[styles.row, { borderBottomColor: colors.border }]}>
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: `${icon.color}18` },
                  ]}>
                  <MaterialCommunityIcons
                    name={icon.name}
                    size={22}
                    color={icon.color}
                  />
                </View>
                <Text variant="body">{option.label}</Text>
              </Pressable>
            );
          })}
        </BottomSheetView>
      </AppBottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
