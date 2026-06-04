import { forwardRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetModal as BottomSheetModalType,
} from '@gorhom/bottom-sheet';
import { Camera, FileText, Image as ImageIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { dismissBottomSheet } from '@/lib/bottom-sheet';

type Props = {
  onCamera: () => void | Promise<void>;
  onPhotos: () => void | Promise<void>;
  onFiles: () => void | Promise<void>;
};

export const ChatAttachmentPickerSheet = forwardRef<BottomSheetModalType, Props>(
  function ChatAttachmentPickerSheet({ onCamera, onPhotos, onFiles }, ref) {
    const { colors } = useTheme();

    const row = (
      label: string,
      icon: ReactNode,
      action: () => void | Promise<void>
    ) => (
      <Pressable
        onPress={() => {
          void action();
          dismissBottomSheet(ref);
        }}
        style={[styles.row, { borderBottomColor: colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceElevated }]}>
          {icon}
        </View>
        <Text variant="body">{label}</Text>
      </Pressable>
    );

    return (
      <BottomSheetModal
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
          {row('Camera', <Camera color={colors.text} size={22} />, onCamera)}
          {row('Photos', <ImageIcon color={colors.text} size={22} />, onPhotos)}
          {row(
            'Files',
            <FileText color={colors.text} size={22} />,
            onFiles
          )}
        </BottomSheetView>
      </BottomSheetModal>
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
