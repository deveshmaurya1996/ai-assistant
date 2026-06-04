import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import type { UserNote } from '@ai-assistant/types';
import { Text } from '@/components/ui/Text';
import { AppMarkdown } from '@/components/markdown/AppMarkdown';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';

type Props = {
  note: UserNote | null;
  visible: boolean;
  onClose: () => void;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const { height: WINDOW_HEIGHT } = Dimensions.get('window');
const PANEL_MAX_HEIGHT = Math.min(WINDOW_HEIGHT * 0.82, 600);

const panelShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
  },
  android: { elevation: 12 },
  default: {},
});

export function NoteDetailModal({ note, visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  if (!note) return null;

  const panelBg = isDark ? 'rgba(28, 32, 48, 0.94)' : 'rgba(255, 255, 255, 0.96)';
  const panelBorder = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';

  const maxPanelHeight = Math.min(
    PANEL_MAX_HEIGHT,
    WINDOW_HEIGHT - insets.top - insets.bottom - spacing.md * 2
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityLabel="Close note"
        />

        <View
          style={[
            styles.center,
            {
              paddingTop: insets.top + spacing.sm,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
          pointerEvents="box-none">
          <View
            style={[
              styles.panel,
              panelShadow,
              {
                maxHeight: maxPanelHeight,
                backgroundColor: panelBg,
                borderColor: panelBorder,
              },
            ]}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text variant="bodyMedium" style={styles.title}>
                  {note.title}
                </Text>
                <Text variant="caption" muted>
                  {formatWhen(note.updatedAt)}
                </Text>
              </View>
              <PressableScale
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close note">
                <View
                  style={[
                    styles.closeBtn,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                  ]}>
                  <X color={colors.textMuted} size={20} />
                </View>
              </PressableScale>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              bounces>
              <AppMarkdown
                content={note.content}
                color={colors.text}
                accentColor={colors.primary}
                variant="note"
              />
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  panel: {
    width: '100%',
    maxWidth: 400,
    minHeight: 0,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  title: {
    lineHeight: 24,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    flexGrow: 1,
  },
});
