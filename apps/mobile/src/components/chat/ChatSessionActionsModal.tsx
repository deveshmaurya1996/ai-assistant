import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pencil, Trash2, X } from 'lucide-react-native';
import type { ChatSession } from '@ai-assistant/sdk';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';

export type MenuAnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  session: ChatSession | null;
  visible: boolean;
  anchor?: MenuAnchorRect | null;
  anchorOffsetY?: number;
  onClose: () => void;
  onRename: (sessionId: string, title: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
};

const MENU_WIDTH = 196;
const ACTIONS_MENU_HEIGHT = 96;
const MENU_GAP = 6;

function computeMenuPosition(
  anchor: MenuAnchorRect,
  menuWidth: number,
  menuHeight: number,
  window: { width: number; height: number },
  insets: { top: number; bottom: number },
  anchorOffsetY = 0
): { top: number; left: number } {
  let left = anchor.x + anchor.width - menuWidth;
  left = Math.max(spacing.sm, Math.min(left, window.width - menuWidth - spacing.sm));

  const gap = MENU_GAP + anchorOffsetY;
  let top = anchor.y + anchor.height + gap;
  if (top + menuHeight > window.height - insets.bottom - spacing.sm) {
    top = anchor.y - menuHeight - gap;
  }
  top = Math.max(insets.top + spacing.sm, top);

  return { top, left };
}

function ActionRow({
  icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <PressableScale onPress={onPress} disabled={disabled}>
      <View style={styles.actionRow}>
        {icon}
        <Text variant="bodyMedium" style={{ color }}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const popupShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  android: { elevation: 10 },
  default: {},
});

const dialogShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
  },
  android: { elevation: 16 },
  default: {},
});

function useRenameKeyboardOffset(active: boolean) {
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      offset.setValue(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const animateTo = (value: number, duration: number) => {
      Animated.timing(offset, {
        toValue: value,
        duration,
        useNativeDriver: true,
      }).start();
    };

    const onShow = (event: KeyboardEvent) => {
      const { height } = event.endCoordinates;
      const shift = Math.min(height * 0.42, height - spacing.lg);
      animateTo(-shift, Platform.OS === 'ios' ? event.duration : 250);
    };

    const onHide = (event: KeyboardEvent) => {
      animateTo(0, Platform.OS === 'ios' ? event.duration : 250);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
      offset.setValue(0);
    };
  }, [active, offset]);

  return offset;
}

export function ChatSessionActionsModal({
  session,
  visible,
  anchor,
  anchorOffsetY = 0,
  onClose,
  onRename,
  onDelete,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const windowSize = Dimensions.get('window');
  const [renameOpen, setRenameOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const keyboardOffset = useRenameKeyboardOffset(renameOpen);

  useEffect(() => {
    if (!visible) {
      setRenameOpen(false);
      setTitleDraft('');
      setBusy(false);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    setRenameOpen(false);
    onClose();
  }, [onClose]);

  const openRename = useCallback(() => {
    if (!session) return;
    setTitleDraft(session.title ?? '');
    setRenameOpen(true);
  }, [session]);

  const closeRename = useCallback(() => {
    Keyboard.dismiss();
    setRenameOpen(false);
    onClose();
  }, [onClose]);

  const confirmDelete = useCallback(() => {
    if (!session) return;
    handleClose();
    const label = session.title ?? 'Untitled';
    const message = `Remove "${label}"? This cannot be undone.`;

    const runDelete = async () => {
      setBusy(true);
      try {
        await onDelete(session.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not delete chat';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Delete failed', msg);
        }
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(message)) void runDelete();
      return;
    }
    Alert.alert('Delete chat', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void runDelete() },
    ]);
  }, [session, onDelete, handleClose]);

  const saveRename = useCallback(async () => {
    if (!session) return;
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      Alert.alert('Title required', 'Enter a name for this chat.');
      return;
    }
    setBusy(true);
    try {
      await onRename(session.id, trimmed);
      handleClose();
    } catch (e) {
      Alert.alert('Rename failed', e instanceof Error ? e.message : 'Could not rename');
    } finally {
      setBusy(false);
    }
  }, [session, titleDraft, onRename, handleClose]);

  const menuPosition = useMemo(() => {
    if (!anchor) return null;
    return computeMenuPosition(
      anchor,
      MENU_WIDTH,
      ACTIONS_MENU_HEIGHT,
      windowSize,
      insets,
      anchorOffsetY
    );
  }, [anchor, anchorOffsetY, insets, windowSize]);

  if (!session) return null;

  const showActionsMenu = visible && !renameOpen;

  return (
    <>
      <Modal
        visible={showActionsMenu}
        transparent
        animationType="fade"
        onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <Pressable
            style={[styles.backdrop, { backgroundColor: colors.overlay }]}
            onPress={handleClose}
            accessibilityLabel="Close menu"
          />

          {menuPosition ? (
            <View
              style={[
                styles.popup,
                popupShadow,
                {
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: MENU_WIDTH,
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}>
              <ActionRow
                icon={<Pencil color={colors.text} size={18} />}
                label="Rename"
                color={colors.text}
                onPress={openRename}
                disabled={busy}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ActionRow
                icon={<Trash2 color={colors.danger} size={18} />}
                label="Delete"
                color={colors.danger}
                onPress={confirmDelete}
                disabled={busy}
              />
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={closeRename}>
        <View style={styles.renameOverlay}>
          <Pressable
            style={[styles.backdrop, { backgroundColor: colors.overlay }]}
            onPress={closeRename}
            accessibilityLabel="Close rename"
          />
          <View style={styles.renameCenter} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.renameCardWrap,
                { transform: [{ translateY: keyboardOffset }] },
              ]}>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View
                  style={[
                    styles.renameCard,
                    dialogShadow,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}>
                  <View style={styles.renameHeader}>
                    <View
                      style={[
                        styles.renameIconWrap,
                        { backgroundColor: colors.primaryMuted },
                      ]}>
                      <Pencil color={colors.primary} size={18} />
                    </View>
                    <View style={styles.renameHeaderText}>
                      <Text variant="bodyMedium">Rename chat</Text>
                      <Text variant="caption" muted numberOfLines={1}>
                        Give this conversation a clear name
                      </Text>
                    </View>
                    <PressableScale
                      onPress={closeRename}
                      disabled={busy}
                      accessibilityLabel="Close">
                      <View
                        style={[
                          styles.renameCloseBtn,
                          { backgroundColor: colors.background },
                        ]}>
                        <X color={colors.textMuted} size={18} />
                      </View>
                    </PressableScale>
                  </View>

                  <View style={styles.renameField}>
                    <Text variant="caption" muted style={styles.renameLabel}>
                      Chat name
                    </Text>
                    <Input
                      value={titleDraft}
                      onChangeText={setTitleDraft}
                      placeholder="Enter a title"
                      autoFocus
                      selectTextOnFocus
                      maxLength={100}
                      returnKeyType="done"
                      onSubmitEditing={() => void saveRename()}
                      style={[
                        styles.renameInput,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.renameActions}>
                    <Button
                      label="Cancel"
                      variant="secondary"
                      onPress={closeRename}
                      disabled={busy}
                      style={styles.renameActionBtn}
                    />
                    <Button
                      label="Save"
                      onPress={() => void saveRename()}
                      loading={busy}
                      disabled={busy || !titleDraft.trim()}
                      style={styles.renameActionBtn}
                    />
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  popup: {
    position: 'absolute',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 44,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.sm,
  },
  renameOverlay: {
    flex: 1,
  },
  renameCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  renameCardWrap: {
    width: '100%',
    maxWidth: 360,
  },
  renameCard: {
    width: '100%',
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  renameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  renameIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  renameCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameField: {
    gap: spacing.xs,
  },
  renameLabel: {
    marginLeft: spacing.xs,
  },
  renameInput: {
    minHeight: 52,
  },
  renameActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  renameActionBtn: {
    flex: 1,
  },
});
