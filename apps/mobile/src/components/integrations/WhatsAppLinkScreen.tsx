import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
} from 'react-native';
import type { CountryCode } from 'react-native-country-picker-modal';
import * as Clipboard from 'expo-clipboard';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, Copy } from 'lucide-react-native';
import { ApiError } from '@ai-assistant/sdk';
import type { WhatsAppSessionStatus } from '@ai-assistant/types';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppHeader } from '@/components/layout/AppHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';
import { CountryPhoneField } from '@/components/integrations/CountryPhoneField';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import {
  buildE164Phone,
  DEFAULT_CALLING_CODE,
  DEFAULT_COUNTRY_CODE,
  formatE164ForDisplay,
  validateLocalPhone,
} from '@/components/integrations/countryCodes';

type LinkMode = 'qr' | 'code';

type Props = {
  connectionId: string;
};

const STEPS_QR = [
  'Open WhatsApp → Settings → Linked devices',
  'Tap Link a device and scan the QR below',
];

const STEPS_CODE = [
  'Enter your 10-digit number (country from the flag)',
  'On phone: Linked devices → Link with phone number',
];

export function WhatsAppLinkScreen({ connectionId }: Props) {
  const router = useRouter();
  const { colors, screenStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<LinkMode>('qr');
  const [session, setSession] = useState<WhatsAppSessionStatus | null>(null);
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>(DEFAULT_COUNTRY_CODE);
  const [callingCode, setCallingCode] = useState(DEFAULT_CALLING_CODE);
  const [loading, setLoading] = useState(true);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkedRef = useRef(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishLink = useCallback(async () => {
    if (linkedRef.current || !connectionId) return;
    linkedRef.current = true;
    setFinishing(true);
    try {
      await apiClient.activateConnection(connectionId);
      router.replace('/(app)/integrations');
    } catch (e) {
      linkedRef.current = false;
      const message = e instanceof ApiError ? e.message : 'Could not complete linking';
      Alert.alert('Link failed', message);
    } finally {
      setFinishing(false);
    }
  }, [connectionId, router]);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiClient.getWhatsAppLinkSession(connectionId);
      setSessionError(null);
      setSession(data);
      if (data.status === 'active') {
        await finishLink();
      }
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not load WhatsApp link session';
      setSessionError(message);
    } finally {
      setLoading(false);
    }
  }, [connectionId, finishLink]);

  const handleRestartConnect = async () => {
    setLoading(true);
    setSessionError(null);
    try {
      const challenge = await apiClient.connectProvider('whatsapp');
      if (challenge.state === 'ready') {
        router.replace('/(app)/integrations');
        return;
      }
      await refreshSession();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not restart WhatsApp connect';
      setSessionError(message);
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSession();
    const interval = setInterval(() => {
      void refreshSession();
    }, 2500);
    return () => clearInterval(interval);
  }, [refreshSession]);

  const pairingCodeRaw =
    (session as { pairingCodeRaw?: string } | null)?.pairingCodeRaw ??
    session?.pairingCode?.replace(/[^A-Za-z0-9]/gi, '').toUpperCase() ??
    '';

  const handleCopyPairingCode = async () => {
    if (!pairingCodeRaw) return;
    await Clipboard.setStringAsync(pairingCodeRaw);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleRequestPairing = async () => {
    const validationError = validateLocalPhone(callingCode, phone);
    if (validationError) {
      Alert.alert('Invalid number', validationError);
      return;
    }
    const digits = buildE164Phone(callingCode, phone);
    setPairingLoading(true);
    try {
      const data = await apiClient.requestWhatsAppPairing(connectionId, digits);
      if (__DEV__) {
        console.log('[WhatsApp pairing] sent', digits, 'linked as', data.pairingPhone);
      }
      setSession((prev) => ({
        connectionId,
        status: (data.status as WhatsAppSessionStatus['status']) ?? prev?.status ?? 'pending',
        pairingCode: data.pairingCode,
        pairingPhone: data.pairingPhone,
        qrData: prev?.qrData,
      }));
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not get pairing code';
      Alert.alert('Pairing code', message);
    } finally {
      setPairingLoading(false);
    }
  };

  const modeOptions = [
    { value: 'qr' as const, label: 'QR code' },
    { value: 'code' as const, label: 'Pairing code' },
  ];

  const footer = finishing ? (
    <View style={styles.linkedRow}>
      <ActivityIndicator color="#25D366" />
      <Text variant="bodyMedium" style={{ color: '#25D366' }}>
        WhatsApp linked — finishing setup…
      </Text>
    </View>
  ) : (
    <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
  );

  return (
    <View style={[screenStyle, styles.root]}>
      <AppHeader title="Link WhatsApp" />
      <View style={styles.body}>
        <View style={styles.heroCompact}>
          <View style={[styles.heroIcon, { backgroundColor: '#25D36622' }]}>
            <ProviderIcon providerId="whatsapp" size="sm" />
          </View>
          <View style={styles.heroText}>
            <Text variant="bodyMedium" style={styles.heroTitle}>
              Connect WhatsApp
            </Text>
            <Text variant="caption" muted numberOfLines={2}>
              Link securely so your assistant can read and send messages.
            </Text>
          </View>
        </View>

        <SegmentedControl options={modeOptions} value={mode} onChange={setMode} />

        {sessionError ? (
          <Card style={styles.card}>
            <Text variant="bodyMedium" style={{ color: colors.danger }}>
              {sessionError}
            </Text>
            <Text variant="caption" muted>
              Keep the app open on this screen while linking. If the QR never appears, tap Start
              over.
            </Text>
            <Button
              label="Start over"
              variant="secondary"
              onPress={() => void handleRestartConnect()}
            />
          </Card>
        ) : null}

        {mode === 'qr' ? (
          <View style={styles.qrPane}>
            <Card style={styles.cardCompact}>
              {loading && !session?.qrData ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color="#25D366" />
                  <Text variant="caption" muted>
                    Generating secure link…
                  </Text>
                </View>
              ) : (
                <>
                  {STEPS_QR.map((step, i) => (
                    <View key={step} style={styles.stepRow}>
                      <View style={[styles.stepNum, { backgroundColor: '#25D366' }]}>
                        <Text variant="label" style={{ color: '#fff', fontSize: 11 }}>
                          {i + 1}
                        </Text>
                      </View>
                      <Text variant="caption" style={styles.stepText}>
                        {step}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.qrFrame, { borderColor: colors.border }]}>
                    {session?.qrData ? (
                      <Image source={{ uri: session.qrData }} style={styles.qr} resizeMode="contain" />
                    ) : (
                      <ActivityIndicator color="#25D366" />
                    )}
                  </View>
                  <Text variant="caption" muted style={styles.qrHint}>
                    QR refreshes automatically. Keep this screen open while you scan.
                  </Text>
                </>
              )}
            </Card>
            {footer}
          </View>
        ) : (
          <View style={styles.codePane}>
            <ScrollView
              style={styles.codeScroll}
              contentContainerStyle={styles.codeScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              bounces={false}>
              <Card style={styles.cardCompactCode}>
                <Text variant="label" muted style={styles.sectionLabel}>
                  Pair with phone number
                </Text>
                {STEPS_CODE.map((step, i) => (
                  <View key={step} style={styles.stepRow}>
                    <View style={[styles.stepNum, { backgroundColor: '#25D366' }]}>
                      <Text variant="label" style={{ color: '#fff', fontSize: 11 }}>
                        {i + 1}
                      </Text>
                    </View>
                    <Text variant="caption" style={styles.stepText}>
                      {step}
                    </Text>
                  </View>
                ))}
                {session?.pairingCode ? (
                  <View
                    style={[
                      styles.codeBox,
                      { borderColor: '#25D366', backgroundColor: '#25D36611' },
                    ]}>
                    {session.pairingPhone ? (
                      <Text variant="caption" muted style={styles.codeMeta}>
                        Linking:{' '}
                        <Text variant="caption" style={{ fontWeight: '600' }}>
                          {formatE164ForDisplay(session.pairingPhone)}
                        </Text>
                      </Text>
                    ) : null}
                    <Text variant="caption" muted>
                      Enter on your phone within 2 minutes
                    </Text>
                    <Text variant="h1" style={styles.codeDigits}>
                      {session.pairingCode}
                    </Text>
                    <Pressable
                      onPress={() => void handleCopyPairingCode()}
                      style={({ pressed }) => [
                        styles.copyBtn,
                        { backgroundColor: pressed ? '#25D36633' : '#25D36622' },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Copy pairing code">
                      {copied ? (
                        <Check size={18} color="#128C7E" />
                      ) : (
                        <Copy size={18} color="#128C7E" />
                      )}
                      <Text variant="bodyMedium" style={styles.copyBtnLabel}>
                        {copied ? 'Copied' : 'Copy code'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </Card>
            </ScrollView>

            <KeyboardStickyView
              offset={{ closed: 0, opened: spacing.xs }}
              style={[
                styles.codeInputDock,
                {
                  paddingBottom: Math.max(insets.bottom, spacing.sm),
                  backgroundColor: colors.background,
                  borderTopColor: colors.border,
                },
              ]}>
              <Text variant="caption" muted>
                Mobile number (without country code)
              </Text>
              <CountryPhoneField
                countryCode={countryCode}
                callingCode={callingCode}
                phone={phone}
                onCountryChange={(code, dial) => {
                  setCountryCode(code);
                  setCallingCode(dial);
                }}
                onPhoneChange={setPhone}
              />
              <Button
                label={
                  pairingLoading
                    ? 'Getting code…'
                    : session?.pairingCode
                      ? 'Get new code'
                      : 'Get pairing code'
                }
                variant="primary"
                loading={pairingLoading}
                disabled={pairingLoading}
                style={{ backgroundColor: '#25D366' }}
                onPress={() => void handleRequestPairing()}
              />
              {footer}
            </KeyboardStickyView>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  heroCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroIcon: {
    padding: spacing.xs,
    borderRadius: radii.full,
  },
  heroText: {
    flex: 1,
    gap: 2,
  },
  heroTitle: { fontWeight: '600' },
  qrPane: {
    flex: 1,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  codePane: {
    flex: 1,
    minHeight: 0,
  },
  codeScroll: {
    flex: 1,
    minHeight: 0,
  },
  codeScrollContent: {
    paddingBottom: spacing.sm,
  },
  codeInputDock: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardCompactCode: {
    gap: spacing.sm,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  card: { gap: spacing.md },
  cardCompact: { gap: spacing.sm, flex: 1 },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.6 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1, lineHeight: 18, fontSize: 12 },
  qrFrame: {
    alignSelf: 'center',
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    width: 196,
    height: 196,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  qr: { width: 172, height: 172 },
  qrHint: { textAlign: 'center', fontSize: 11 },
  codeMeta: {
    textAlign: 'center',
  },
  codeBox: {
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  codeDigits: {
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
    color: '#128C7E',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
  copyBtnLabel: {
    color: '#128C7E',
    fontWeight: '600',
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
