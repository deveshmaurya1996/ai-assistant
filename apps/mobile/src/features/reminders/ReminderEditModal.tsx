import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import type { Reminder } from '@ai-assistant/types';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import { getDeviceTimezone } from '@/lib/deviceTimezone';
import { ReminderWhenField } from '@/features/reminders/ReminderWhenField';

type ReminderRow = Reminder & { scheduleLabel?: string | null };
type RepeatOption = 'none' | 'minute' | 'hourly' | 'daily' | 'weekly';

const REPEAT_OPTIONS: { id: RepeatOption; label: string }[] = [
  { id: 'none', label: 'Once' },
  { id: 'minute', label: 'Every min' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
];

type Props = {
  reminder: ReminderRow | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const { height: WINDOW_HEIGHT } = Dimensions.get('window');
const PANEL_MAX_HEIGHT = Math.min(WINDOW_HEIGHT * 0.85, 640);

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

export function ReminderEditModal({ reminder, visible, onClose, onSaved }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [whenDate, setWhenDate] = useState(() => new Date());
  const [repeat, setRepeat] = useState<RepeatOption>('none');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!reminder) return;
    setTitle(getTitle(reminder));
    setUserPrompt(reminder.userPrompt ?? '');
    setWhenDate(new Date(reminder.nextFireAt));
    setRepeat(repeatFromReminder(reminder));
  }, [reminder]);

  const handleSave = useCallback(async () => {
    if (!reminder) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Title required', 'Add a short title for this reminder.');
      return;
    }

    const schedule = cronForRepeat(repeat, whenDate);
    setSaving(true);
    try {
      await apiClient.updateReminder(reminder.id, {
        title: trimmedTitle,
        userPrompt: userPrompt.trim() || undefined,
        nextFireAt: whenDate.toISOString(),
        recurrence: schedule.recurrence,
        cronExpression: schedule.cron,
        timezone: getDeviceTimezone(),
      });
      onSaved();
      onClose();
    } catch {
      Alert.alert('Save failed', 'Could not update this reminder. Try again.');
    } finally {
      setSaving(false);
    }
  }, [reminder, title, userPrompt, whenDate, repeat, onClose, onSaved]);

  if (!reminder) return null;

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
          accessibilityLabel="Close reminder"
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
              <Text variant="bodyMedium" style={styles.headerTitle}>
                Edit reminder
              </Text>
              <PressableScale onPress={onClose} accessibilityLabel="Close">
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
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View style={styles.field}>
                <Text variant="label" muted>
                  Title
                </Text>
                <Input value={title} onChangeText={setTitle} placeholder="Reminder title" />
              </View>

              <View style={styles.field}>
                <Text variant="label" muted>
                  Your message
                </Text>
                <Input
                  value={userPrompt}
                  onChangeText={setUserPrompt}
                  placeholder="What you asked"
                  multiline
                  style={styles.multiline}
                />
              </View>

              <View style={styles.field}>
                <Text variant="label" muted>
                  Next time
                </Text>
                <ReminderWhenField value={whenDate} onChange={setWhenDate} />
              </View>

              <View style={styles.field}>
                <Text variant="label" muted>
                  Repeat
                </Text>
                <View style={styles.repeatRow}>
                  {REPEAT_OPTIONS.map((opt) => {
                    const active = repeat === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => setRepeat(opt.id)}
                        style={[
                          styles.repeatChip,
                          {
                            backgroundColor: active ? colors.primaryMuted : colors.surfaceElevated,
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}>
                        <Text
                          variant="caption"
                          style={{ color: active ? colors.primary : colors.text }}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Button label="Save" onPress={() => void handleSave()} loading={saving} />
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getTitle(item: ReminderRow): string {
  return (item.payload as { title?: string }).title ?? 'Reminder';
}

function repeatFromReminder(item: ReminderRow): RepeatOption {
  const cron = item.cronExpression;
  if (!cron || item.recurrence === 'NONE') return 'none';
  if (cron === '* * * * *' || cron === '*/1 * * * *') return 'minute';
  if (item.recurrence === 'HOURLY') return 'hourly';
  if (item.recurrence === 'DAILY') return 'daily';
  if (item.recurrence === 'WEEKLY') return 'weekly';
  return 'none';
}

function cronForRepeat(
  repeat: RepeatOption,
  anchor: Date
): { recurrence: string; cron: string | null } {
  const minute = anchor.getMinutes();
  const hour = anchor.getHours();
  const dow = anchor.getDay();

  switch (repeat) {
    case 'minute':
      return { recurrence: 'CUSTOM', cron: '* * * * *' };
    case 'hourly':
      return { recurrence: 'HOURLY', cron: '0 * * * *' };
    case 'daily':
      return { recurrence: 'DAILY', cron: `${minute} ${hour} * * *` };
    case 'weekly':
      return { recurrence: 'WEEKLY', cron: `${minute} ${hour} * * ${dow}` };
    default:
      return { recurrence: 'NONE', cron: null };
  }
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill },
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { flex: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { padding: spacing.md, paddingTop: spacing.xs, gap: spacing.md },
  field: { gap: spacing.xs },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  repeatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  repeatChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
  },
});
