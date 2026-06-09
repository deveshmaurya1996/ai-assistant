import { useState } from 'react';
import { Alert, ScrollView, View, StyleSheet, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { Check, ExternalLink } from 'lucide-react-native';
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
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from '@/content/terms';
import { useSettingsStore } from '@/stores/settings';

function openLegalUrl(url: string) {
  void Linking.openURL(url).catch(() => {
    Alert.alert('Could not open link', 'Please try again in your browser.');
  });
}

function LegalLinkCard({
  title,
  body,
  url,
  linkLabel,
}: {
  title: string;
  body: string;
  url: string;
  linkLabel: string;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => openLegalUrl(url)}
      style={[styles.legalCard, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
      <View style={styles.legalCardHeader}>
        <Text variant="h2">{title}</Text>
        <ExternalLink color={colors.primary} size={18} />
      </View>
      <Text variant="body" muted style={styles.legalBody}>
        {body}
      </Text>
      <Text variant="caption" style={{ color: colors.primary, marginTop: spacing.sm }}>
        {linkLabel}
      </Text>
      <Text variant="caption" muted style={styles.legalUrl} numberOfLines={2}>
        {url}
      </Text>
    </Pressable>
  );
}

export default function TermsScreen() {
  const { colors } = useTheme();
  const acceptTerms = useSettingsStore((s) => s.acceptTerms);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const onContinue = async () => {
    if (!checked || loading) return;
    setLoading(true);
    try {
      await acceptTerms();
      router.replace('/(auth)/register');
    } catch (e) {
      Alert.alert(
        'Could not continue',
        e instanceof Error ? e.message : 'Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen safeTop padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="h1" style={styles.heading}>
          Before you join
        </Text>
        <Text variant="body" muted style={styles.intro}>
          Review our legal documents below. You must accept both before creating an account.
        </Text>

        <LegalLinkCard
          title={TERMS_TITLE}
          body={TERMS_BODY}
          url={TERMS_URL}
          linkLabel="Open Terms of Service"
        />
        <LegalLinkCard
          title={PRIVACY_TITLE}
          body={PRIVACY_BODY}
          url={PRIVACY_POLICY_URL}
          linkLabel="Open Privacy Policy"
        />

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
          <Text variant="body" style={styles.checkText}>
            I agree to the{' '}
            <Text
              variant="body"
              style={{ color: colors.primary }}
              onPress={() => openLegalUrl(TERMS_URL)}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              variant="body"
              style={{ color: colors.primary }}
              onPress={() => openLegalUrl(PRIVACY_POLICY_URL)}>
              Privacy Policy
            </Text>
          </Text>
        </Pressable>

        <Button
          label={loading ? 'Continuing…' : 'Continue'}
          onPress={onContinue}
          disabled={!checked || loading}
          loading={loading}
        />
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
  intro: { lineHeight: 22, marginBottom: spacing.lg },
  legalCard: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  legalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  legalBody: {
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  legalUrl: {
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginVertical: spacing.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  checkText: {
    flex: 1,
    lineHeight: 22,
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
