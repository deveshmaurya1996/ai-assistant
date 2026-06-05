import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
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

export function ReminderWhenField({ value, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const [editing, setEditing] = useState(false);
  const readable = formatReminderTime(value);

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

  if (editing) {
    return (
      <View style={styles.wrap}>
        <Input
          value={toLocalDatetimeInputValue(value)}
          onChangeText={(text) => {
            const next = parseLocalDatetimeInputValue(text);
            if (next) onChange(next);
          }}
          onBlur={() => setEditing(false)}
          placeholder="YYYY-MM-DDTHH:mm"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        <Text variant="caption" muted>
          Local time · tap away when done
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setEditing(true)}
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
