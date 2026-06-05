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
import {
  getAgentDigestQuery,
  isAgentDigestAction,
  type Automation,
} from '@ai-assistant/types';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import { getDeviceTimezone } from '@/lib/deviceTimezone';
import { ReminderWhenField } from '@/features/reminders/ReminderWhenField';

type RepeatOption = 'hourly' | 'every2h' | 'every6h' | 'daily' | 'weekly';

const REPEAT_OPTIONS: { id: RepeatOption; label: string }[] = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'every2h', label: 'Every 2 hours' },
  { id: 'every6h', label: 'Every 6 hours' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
];

type Props = {
  automation: Automation | null;
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

export function AutomationEditModal({ automation, visible, onClose, onSaved }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [whenDate, setWhenDate] = useState(() => new Date());
  const [repeat, setRepeat] = useState<RepeatOption>('hourly');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!automation) return;
    setName(automation.name);
    setQuery(getAgentDigestQuery(automation.action));
    setWhenDate(anchorFromSchedule(automation.schedule));
    setRepeat(repeatFromSchedule(automation.schedule));
    setIsActive(automation.isActive);
  }, [automation]);

  const handleSave = useCallback(async () => {
    if (!automation) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Add a name for this automation.');
      return;
    }

    const trimmedQuery = query.trim();
    if (isAgentDigestAction(automation.action) && !trimmedQuery) {
      Alert.alert('Query required', 'Describe what this automation should check.');
      return;
    }

    setSaving(true);
    try {
      await apiClient.updateAutomation(automation.id, {
        name: trimmedName,
        schedule: cronForRepeat(repeat, whenDate),
        isActive,
        ...(isAgentDigestAction(automation.action) ? { query: trimmedQuery } : {}),
        timezone: getDeviceTimezone(),
      });
      onSaved();
      onClose();
    } catch {
      Alert.alert('Save failed', 'Could not update this automation. Try again.');
    } finally {
      setSaving(false);
    }
  }, [automation, name, query, whenDate, repeat, isActive, onClose, onSaved]);

  if (!automation) return null;

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
        />
        <View style={styles.center}>
          <View
            style={[
              styles.panel,
              panelShadow,
              {
                backgroundColor: panelBg,
                borderColor: panelBorder,
                maxHeight: maxPanelHeight,
              },
            ]}>
            <View style={styles.header}>
              <Text variant="bodyMedium" style={styles.headerTitle}>
                Edit automation
              </Text>
              <PressableScale onPress={onClose} hitSlop={8}>
                <View style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}>
                  <X color={colors.textMuted} size={20} />
                </View>
              </PressableScale>
            </View>

            <ScrollView
              style={{ maxHeight: maxPanelHeight - 56 }}
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled">
              <View style={styles.field}>
                <Text variant="label" muted>
                  Name
                </Text>
                <Input value={name} onChangeText={setName} placeholder="Inbox digest" />
              </View>

              {isAgentDigestAction(automation.action) ? (
                <View style={styles.field}>
                  <Text variant="label" muted>
                    What to check
                  </Text>
                  <Input
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Check my inbox for important emails"
                    multiline
                    style={styles.multiline}
                  />
                </View>
              ) : null}

              {(repeat === 'daily' || repeat === 'weekly') && (
                <ReminderWhenField value={whenDate} onChange={setWhenDate} />
              )}

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

              <View style={styles.field}>
                <Text variant="label" muted>
                  Status
                </Text>
                <View style={styles.repeatRow}>
                  {[
                    { id: true, label: 'Running' },
                    { id: false, label: 'Paused' },
                  ].map((opt) => {
                    const active = isActive === opt.id;
                    return (
                      <Pressable
                        key={String(opt.id)}
                        onPress={() => setIsActive(opt.id)}
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

function repeatFromSchedule(schedule: string | null): RepeatOption {
  if (!schedule) return 'hourly';
  const normalized = schedule.trim();
  if (normalized.includes('*/2') || normalized.startsWith('0/2')) return 'every2h';
  if (normalized.includes('*/6')) return 'every6h';
  if (/\s\*\s\*\s[0-6]$/.test(normalized) || normalized.split(/\s+/).length >= 5 && normalized.split(/\s+/)[4] !== '*') {
    return 'weekly';
  }
  if (/\d+\s+\d+\s\*\s\*\s\*/.test(normalized)) return 'daily';
  return 'hourly';
}

function anchorFromSchedule(schedule: string | null): Date {
  const anchor = new Date();
  if (!schedule) return anchor;
  const parts = schedule.trim().split(/\s+/);
  const fields = parts.length === 6 ? parts.slice(1) : parts;
  if (fields.length < 5) return anchor;
  const minute = parseInt(fields[0], 10);
  const hour = parseInt(fields[1], 10);
  if (!Number.isNaN(minute)) anchor.setMinutes(minute);
  if (!Number.isNaN(hour)) anchor.setHours(hour);
  return anchor;
}

function cronForRepeat(repeat: RepeatOption, anchor: Date): string {
  const minute = anchor.getMinutes();
  const hour = anchor.getHours();
  const dow = anchor.getDay();

  switch (repeat) {
    case 'every2h':
      return '0 */2 * * *';
    case 'every6h':
      return '0 */6 * * *';
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${dow}`;
    default:
      return '0 * * * *';
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
