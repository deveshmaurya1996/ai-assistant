import { Modal, Pressable, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import type { MobileVersionInfo } from '@/lib/api-client';

type Props = {
  visible: boolean;
  info: MobileVersionInfo | null;
  required: boolean;
  onDismiss?: () => void;
};

export function UpdateRequiredModal({ visible, info, required, onDismiss }: Props) {
  const { colors } = useTheme();

  const openUpdate = () => {
    if (!info?.updateUrl) return;
    void Linking.openURL(info.updateUrl);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={required ? undefined : onDismiss}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
        onPress={required ? undefined : onDismiss}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}>
          <Text variant="h2" style={styles.title}>
            {required ? 'Update required' : 'Update available'}
          </Text>
          <Text variant="body" muted style={styles.message}>
            {required
              ? 'A new version of AI Assistant is required to continue. Please update the app.'
              : `Version ${info?.latestVersion ?? ''} is available. Update now for the latest fixes and features.`}
          </Text>
          <View style={styles.actions}>
            {!required && onDismiss ? (
              <Button label="Later" variant="ghost" onPress={onDismiss} style={styles.actionBtn} />
            ) : null}
            <Button
              label="Update now"
              variant="primary"
              onPress={openUpdate}
              disabled={!info?.updateUrl}
              style={styles.actionBtn}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  title: {
    marginBottom: spacing.sm,
  },
  message: {
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    minWidth: 120,
  },
});
