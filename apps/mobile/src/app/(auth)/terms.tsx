import { useState } from 'react';
import { ScrollView, View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import {
  TERMS_BODY,
  TERMS_TITLE,
  PRIVACY_BODY,
  PRIVACY_TITLE,
} from '@/content/terms';
import { useSettingsStore } from '@/stores/settings';

export default function TermsScreen() {
  const { colors } = useTheme();
  const acceptTerms = useSettingsStore((s) => s.acceptTerms);
  const [checked, setChecked] = useState(false);

  const onContinue = async () => {
    if (!checked) return;
    await acceptTerms();
    router.push('/(auth)/register');
  };

  return (
    <Screen safeTop padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="h1" style={styles.heading}>
          Before you join
        </Text>
        <Text variant="h2" style={{ marginTop: spacing.lg }}>
          {TERMS_TITLE}
        </Text>
        <Text variant="body" muted style={styles.body}>
          {TERMS_BODY}
        </Text>
        <Text variant="h2" style={{ marginTop: spacing.lg }}>
          {PRIVACY_TITLE}
        </Text>
        <Text variant="body" muted style={styles.body}>
          {PRIVACY_BODY}
        </Text>

        <Pressable
          onPress={() => setChecked((c) => !c)}
          style={[styles.checkRow, { borderColor: colors.border }]}>
          <View
            style={[
              styles.checkbox,
              {
                borderColor: colors.primary,
                backgroundColor: checked ? colors.primary : 'transparent',
              },
            ]}>
            {checked ? <Check color={colors.onPrimary} size={16} /> : null}
          </View>
          <Text variant="body" style={{ flex: 1 }}>
            I agree to the Terms of Service and Privacy Policy
          </Text>
        </Pressable>

        <Button label="Continue" onPress={onContinue} disabled={!checked} />
        <Button
          label="Back"
          variant="ghost"
          onPress={() => router.back()}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  heading: { marginBottom: spacing.sm },
  body: { marginTop: spacing.sm, lineHeight: 22 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginVertical: spacing.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
