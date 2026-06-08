import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import {
  formatReminderTime,
  parseLocalDatetimeInputValue,
  toLocalDatetimeInputValue,
} from '@/lib/formatReminderTime';

type Props = {
  value: Date;
  onChange: (date: Date) => void;
};

type AndroidPickerStep = 'date' | 'time';

export function ReminderWhenField({ value, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [androidStep, setAndroidStep] = useState<AndroidPickerStep | null>(null);
  const [draftDate, setDraftDate] = useState(value);
  const readable = formatReminderTime(value);

  const openPicker = () => {
    if (Platform.OS === 'android') {
      setDraftDate(value);
      setAndroidStep('date');
      return;
    }
    setPickerOpen((open) => !open);
  };

  const closeAndroidPicker = () => setAndroidStep(null);

  const handleAndroidDate = (_event: unknown, picked: Date) => {
    const next = new Date(draftDate);
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    setDraftDate(next);
    setAndroidStep('time');
  };

  const handleAndroidTime = (_event: unknown, picked: Date) => {
    const next = new Date(draftDate);
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    onChange(next);
    closeAndroidPicker();
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        <label style={webLabelStyle}>
          <Text variant="body" style={styles.readable}>
            {readable}
          </Text>
          <input
            type="datetime-local"
            value={toLocalDatetimeInputValue(value)}
            onChange={(e) => {
              const next = parseLocalDatetimeInputValue(e.target.value);
              if (next) onChange(next);
            }}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '10px 12px',
              fontSize: 15,
              borderRadius: radii.md,
              border: `1px solid ${colors.border}`,
              backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
              color: colors.text,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </label>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={openPicker}
        style={[
          styles.readableBox,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Next time: ${readable}. Tap to edit.`}>
        <Text variant="body">{readable}</Text>
        <Text variant="caption" muted style={styles.tapHint}>
          Tap to change
        </Text>
      </Pressable>

      {Platform.OS === 'ios' && pickerOpen ? (
        <DateTimePicker
          value={value}
          mode="datetime"
          display="inline"
          minimumDate={new Date()}
          onValueChange={(_event, selected) => onChange(selected)}
        />
      ) : null}

      {Platform.OS === 'android' && androidStep === 'date' ? (
        <DateTimePicker
          value={draftDate}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onValueChange={handleAndroidDate}
          onDismiss={closeAndroidPicker}
        />
      ) : null}

      {Platform.OS === 'android' && androidStep === 'time' ? (
        <DateTimePicker
          value={draftDate}
          mode="time"
          display="default"
          onValueChange={handleAndroidTime}
          onDismiss={closeAndroidPicker}
        />
      ) : null}
    </View>
  );
}

const webLabelStyle = {
  display: 'block',
  width: '100%',
  cursor: 'pointer',
} as const;

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  readable: { marginBottom: 0 },
  readableBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  tapHint: { marginTop: 2 },
});
