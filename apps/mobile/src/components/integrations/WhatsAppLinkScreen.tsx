import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Pressable,
  Keyboard,
  type TextInput,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import type { CountryCode } from 'react-native-country-picker-modal';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, Copy } from 'lucide-react-native';
import { ApiError } from '@ai-assistant/sdk';
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
import {
  isPairingExpired,
  mergePairingSession,
  usePairingCountdown,
  type PairingSessionState,
} from '@/components/integrations/useWhatsAppPairingSession';

type LinkMode = 'qr' | 'code';

type Props = {
  connectionId: string;
};

type SessionState = PairingSessionState;
const WHATSAPP_GREEN = '#25D366';
const WHATSAPP_DARK = '#128C7E';

const STEPS_QR = [
  'Open WhatsApp → Settings → Linked devices',
  'Tap Link a device and scan the QR code below',
];

const STEPS_CODE = [
  'Enter the number on your WhatsApp account',
  'Tap Continue — then enter the code on your phone',
];

function isRecoverableSessionError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not ready') ||
    lower.includes('expired') ||
    lower.includes('connect again') ||
    lower.includes('tap connect') ||
    lower.includes('session expired')
  );
}

function applyPhoneFromE164(e164: string): {
  countryCode: CountryCode;
  callingCode: string;
  phone: string;
} {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    return { countryCode: 'IN', callingCode: '91', phone: digits.slice(2) };
  }
  return { countryCode: DEFAULT_COUNTRY_CODE, callingCode: DEFAULT_CALLING_CODE, phone: digits };
}

function phoneHint(callingCode: string): string {
  const dial = callingCode.replace(/\D/g, '');
  if (dial === '91') return '10-digit mobile number (without +91)';
  return 'Mobile number without country code';
}

function formatUpdatedAgo(updatedAt?: string): string {
  if (!updatedAt) return '';
  const secs = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
  if (secs < 5) return 'Refreshed just now';
  if (secs < 60) return `Refreshed ${secs}s ago`;
  return `Refreshed ${Math.floor(secs / 60)}m ago`;
}

function formatCountdown(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type LinkStatus = {
  label: string;
  color: string;
  showSpinner: boolean;
  prominent: boolean;
};

function getLinkStatus(
  session: SessionState | null,
  loading: boolean,
  finishing: boolean,
  colors: { danger: string; textMuted: string }
): LinkStatus {
  if (finishing || session?.status === 'active') {
    return {
      label: 'Linking your account…',
      color: WHATSAPP_DARK,
      showSpinner: true,
      prominent: true,
    };
  }
  if (session?.pairingAccepted) {
    return {
      label: 'Code accepted — finishing link… keep this screen open',
      color: WHATSAPP_DARK,
      showSpinner: true,
      prominent: true,
    };
  }
  if (session?.pairingReconnecting && session?.pairingCode) {
    return {
      label: 'Reconnecting… keep this screen open',
      color: WHATSAPP_DARK,
      showSpinner: true,
      prominent: true,
    };
  }
  if (session?.pairingReconnecting) {
    return {
      label: 'Reconnecting…',
      color: colors.textMuted,
      showSpinner: true,
      prominent: true,
    };
  }
  if (session?.pairingInvalidated) {
    return {
      label: 'Previous code expired',
      color: colors.danger,
      showSpinner: false,
      prominent: true,
    };
  }
  if (session?.pairingCode && isPairingExpired(session)) {
    return {
      label: 'Pairing code expired',
      color: colors.danger,
      showSpinner: false,
      prominent: true,
    };
  }
  if (loading) {
    return {
      label: 'Preparing connection…',
      color: colors.textMuted,
      showSpinner: true,
      prominent: true,
    };
  }
  return {
    label: '',
    color: colors.textMuted,
    showSpinner: false,
    prominent: false,
  };
}

type PairingCodeDisplayProps = {
  code: string;
  pairingPhone?: string;
  expiresAt?: string;
  issuedAt?: string;
  onCopy: () => void;
  onChangeNumber: () => void;
  copied: boolean;
};

function formatPairingCodeLine(code: string): string {
  const raw = code.replace(/[^A-Za-z0-9]/gi, '').toUpperCase();
  if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  return code.toUpperCase();
}

function PairingCodeDisplay({
  code,
  pairingPhone,
  expiresAt,
  issuedAt,
  onCopy,
  onChangeNumber,
  copied,
}: PairingCodeDisplayProps) {
  const { colors } = useTheme();
  const remaining = usePairingCountdown(expiresAt, issuedAt);
  const displayCode = formatPairingCodeLine(code);
  const expired = remaining !== null && remaining <= 0;

  return (
    <View
      style={[
        styles.codeCard,
        {
          borderColor: expired ? colors.danger : WHATSAPP_GREEN,
          backgroundColor: `${WHATSAPP_GREEN}0D`,
        },
      ]}>
      {pairingPhone ? (
        <View style={styles.codePhoneRow}>
          <Text variant="caption" muted style={styles.codeMeta}>
            {formatE164ForDisplay(pairingPhone)}
          </Text>
          <Pressable
            onPress={onChangeNumber}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Change phone number">
            <Text variant="caption" style={{ color: WHATSAPP_DARK, fontWeight: '600' }}>
              Change
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Text variant="caption" muted style={styles.codeHint}>
        On your phone: WhatsApp → Settings → Linked devices → Link with phone number
      </Text>

      <View style={styles.codeLineRow}>
        <Text
          variant="h1"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[
            styles.codeLineText,
            { color: expired ? colors.danger : WHATSAPP_DARK },
          ]}>
          {displayCode}
        </Text>
        <Pressable
          onPress={onCopy}
          disabled={expired}
          style={({ pressed }) => [
            styles.copyIconBtn,
            {
              backgroundColor: pressed ? `${WHATSAPP_GREEN}33` : `${WHATSAPP_GREEN}22`,
              opacity: expired ? 0.5 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Copied' : 'Copy pairing code'}>
          {copied ? <Check size={20} color={WHATSAPP_DARK} /> : <Copy size={20} color={WHATSAPP_DARK} />}
        </Pressable>
      </View>

      <View style={styles.codeFooterRow}>
        <Text
          variant="caption"
          style={{ color: expired ? colors.danger : colors.textMuted }}
          numberOfLines={1}>
          {expired
            ? 'Code expired'
            : remaining !== null
              ? `Expires in ${formatCountdown(remaining)}`
              : 'Valid for 2 minutes'}
        </Text>
        {!expired ? (
          <>
            <Text variant="caption" muted>
              ·
            </Text>
            <Text variant="caption" muted numberOfLines={1} style={styles.waitingInline}>
              Waiting on your phone
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <>
      {steps.map((step, i) => (
        <View key={step} style={styles.stepRow}>
          <View style={[styles.stepNum, { backgroundColor: WHATSAPP_GREEN }]}>
            <Text variant="label" style={styles.stepNumText}>
              {i + 1}
            </Text>
          </View>
          <Text variant="caption" style={styles.stepText}>
            {step}
          </Text>
        </View>
      ))}
    </>
  );
}

export function WhatsAppLinkScreen({ connectionId }: Props) {
  const router = useRouter();
  const { colors, screenStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<LinkMode>('qr');
  const [session, setSession] = useState<SessionState | null>(null);
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>(DEFAULT_COUNTRY_CODE);
  const [callingCode, setCallingCode] = useState(DEFAULT_CALLING_CODE);
  const [loading, setLoading] = useState(true);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [copied, setCopied] = useState(false);
  const linkedRef = useRef(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const codeScrollRef = useRef<KeyboardAwareScrollViewRef>(null);

  const hasActivePairing =
    mode === 'code' &&
    !!session?.pairingCode &&
    !isPairingExpired(session) &&
    !session.pairingInvalidated;

  const pairingCodeExpired =
    !!session?.pairingCode && (isPairingExpired(session) || session.pairingExpired);
  const showPairingCode =
    !!session?.pairingCode && !pairingCodeExpired && !session.pairingInvalidated;
  const showPairingCodeView = showPairingCode && !editingPhone;

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
      setSession((prev) => mergePairingSession(prev, data));
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
    setSession(null);
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
    }, hasActivePairing ? 1000 : 2500);
    return () => clearInterval(interval);
  }, [refreshSession, hasActivePairing]);

  const shouldFocusPhone = mode === 'code' && !showPairingCodeView && !finishing;

  useEffect(() => {
    if (!shouldFocusPhone) return;
    const timer = setTimeout(() => {
      phoneInputRef.current?.focus();
      codeScrollRef.current?.assureFocusedInputVisible();
    }, 350);
    return () => clearTimeout(timer);
  }, [shouldFocusPhone]);

  useEffect(() => {
    if (!showPairingCodeView) return;
    Keyboard.dismiss();
    phoneInputRef.current?.blur();
  }, [showPairingCodeView]);

  useEffect(() => {
    if (!session?.pairingPhone || phone || editingPhone) return;
    const parsed = applyPhoneFromE164(session.pairingPhone);
    setCountryCode(parsed.countryCode);
    setCallingCode(parsed.callingCode);
    setPhone(parsed.phone);
  }, [session?.pairingPhone, phone, editingPhone]);

  const pairingCodeRaw =
    session?.pairingCodeRaw ??
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

  const handleChangeNumber = () => {
    if (session?.pairingPhone) {
      const parsed = applyPhoneFromE164(session.pairingPhone);
      setCountryCode(parsed.countryCode);
      setCallingCode(parsed.callingCode);
      setPhone(parsed.phone);
    }
    setEditingPhone(true);
    setSession((prev) =>
      prev
        ? {
            ...prev,
            pairingCode: undefined,
            pairingCodeRaw: undefined,
            pairingPhone: undefined,
            pairingCodeIssuedAt: undefined,
            pairingCodeExpiresAt: undefined,
            pairingInvalidated: false,
            pairingExpired: false,
          }
        : null
    );
  };

  const handleRequestPairing = async (forceRefresh = false) => {
    const validationError = validateLocalPhone(callingCode, phone);
    if (validationError) {
      Alert.alert('Invalid number', validationError);
      return;
    }
    const digits = buildE164Phone(callingCode, phone);
    const pairingOptions = { countryCode: callingCode, forceRefresh };

    const applyPairingResponse = (data: SessionState) => {
      setSessionError(null);
      setEditingPhone(false);
      setSession({ ...data, connectionId });
    };

    setPairingLoading(true);
    try {
      const data = await apiClient.requestWhatsAppPairing(connectionId, digits, pairingOptions);
      applyPairingResponse(data);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not get pairing code';
      if (isRecoverableSessionError(message)) {
        try {
          const recovered = await apiClient.requestWhatsAppPairing(connectionId, digits, {
            ...pairingOptions,
            forceRefresh: true,
          });
          applyPairingResponse(recovered);
          return;
        } catch {
          /* fall through to alert */
        }
      }
      Alert.alert('Pairing code', message);
    } finally {
      setPairingLoading(false);
    }
  };

  const modeOptions = [
    { value: 'qr' as const, label: 'QR code' },
    { value: 'code' as const, label: 'Pairing code' },
  ];

  const linkStatus = getLinkStatus(session, loading, finishing, colors);

  const startOverButton = (
    <Button
      label={loading ? 'Starting over…' : 'Start over'}
      variant="primary"
      loading={loading}
      disabled={loading || finishing}
      style={{ backgroundColor: WHATSAPP_GREEN }}
      onPress={() => void handleRestartConnect()}
    />
  );

  return (
    <View style={[screenStyle, styles.root]}>
      <AppHeader title="Link WhatsApp" />
      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.heroCompact}>
          <View style={[styles.heroIcon, { backgroundColor: `${WHATSAPP_GREEN}22` }]}>
            <ProviderIcon providerId="whatsapp" size="sm" />
          </View>
          <View style={styles.heroText}>
            <Text variant="bodyMedium" style={styles.heroTitle}>
              Connect WhatsApp
            </Text>
            {linkStatus.prominent ? (
              <View style={styles.statusInline}>
                {linkStatus.showSpinner ? (
                  <ActivityIndicator size="small" color={linkStatus.color} />
                ) : null}
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={{ color: linkStatus.color, fontWeight: '500', flexShrink: 1 }}>
                  {linkStatus.label}
                </Text>
              </View>
            ) : (
              <Text variant="caption" muted numberOfLines={2}>
                Link securely so your assistant can read and send messages.
              </Text>
            )}
          </View>
        </View>

        <SegmentedControl options={modeOptions} value={mode} onChange={setMode} />

        {mode === 'qr' ? (
          <View style={styles.qrPane}>
            <Card style={styles.card}>
              {sessionError ? (
                <Text variant="caption" style={{ color: colors.danger }}>
                  {sessionError}
                </Text>
              ) : null}
              {loading && !session?.qrData ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={WHATSAPP_GREEN} />
                  <Text variant="caption" muted>
                    Generating secure link…
                  </Text>
                </View>
              ) : (
                <>
                  <StepList steps={STEPS_QR} />
                  <View style={[styles.qrFrame, { borderColor: colors.border }]}>
                    {session?.qrData ? (
                      <Image
                        source={{ uri: session.qrData }}
                        style={styles.qr}
                        resizeMode="contain"
                      />
                    ) : (
                      <ActivityIndicator color={WHATSAPP_GREEN} />
                    )}
                  </View>
                  {session?.updatedAt ? (
                    <Text variant="caption" muted style={styles.qrHint}>
                      {formatUpdatedAgo(session.updatedAt)}. Keep this screen open while you scan.
                    </Text>
                  ) : (
                    <Text variant="caption" muted style={styles.qrHint}>
                      QR refreshes automatically. Keep this screen open while you scan.
                    </Text>
                  )}
                </>
              )}
              {sessionError ? startOverButton : null}
            </Card>
          </View>
        ) : showPairingCodeView && session?.pairingCode ? (
          <View style={styles.codeResultPane}>
            <Card style={styles.cardCompact}>
              {sessionError ? (
                <Text variant="caption" style={{ color: colors.danger }}>
                  {sessionError}
                </Text>
              ) : null}
              <PairingCodeDisplay
                code={session.pairingCode}
                pairingPhone={session.pairingPhone}
                expiresAt={session.pairingCodeExpiresAt}
                issuedAt={session.pairingCodeIssuedAt}
                onCopy={() => void handleCopyPairingCode()}
                onChangeNumber={handleChangeNumber}
                copied={copied}
              />
              {sessionError
                ? startOverButton
                : (
                  <Button
                    label={pairingLoading ? 'Getting code…' : 'Get new code'}
                    variant="secondary"
                    loading={pairingLoading}
                    disabled={pairingLoading || finishing}
                    onPress={() => void handleRequestPairing(true)}
                  />
                )}
            </Card>
          </View>
        ) : (
          <KeyboardAwareScrollView
            ref={codeScrollRef}
            style={styles.codePane}
            contentContainerStyle={styles.codeScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            bottomOffset={Math.max(insets.bottom, spacing.sm)}
            extraKeyboardSpace={spacing.md}>
            <Card style={styles.card}>
              {sessionError ? (
                <Text variant="caption" style={{ color: colors.danger }}>
                  {sessionError}
                </Text>
              ) : null}
              <StepList steps={STEPS_CODE} />

              <View style={styles.phoneSection}>
                <Text variant="caption" muted>
                  {phoneHint(callingCode)}
                </Text>
                <CountryPhoneField
                  ref={phoneInputRef}
                  countryCode={countryCode}
                  callingCode={callingCode}
                  phone={phone}
                  autoFocus={shouldFocusPhone}
                  onCountryChange={(code, dial) => {
                    setCountryCode(code);
                    setCallingCode(dial);
                  }}
                  onPhoneChange={setPhone}
                />
              </View>

              {sessionError
                ? startOverButton
                : (
                  <Button
                    label={
                      pairingLoading
                        ? 'Getting code…'
                        : pairingCodeExpired || session?.pairingInvalidated
                          ? 'Get new code'
                          : 'Continue'
                    }
                    variant="primary"
                    loading={pairingLoading}
                    disabled={pairingLoading || finishing}
                    style={{ backgroundColor: WHATSAPP_GREEN }}
                    onPress={() =>
                      void handleRequestPairing(
                        pairingCodeExpired || !!session?.pairingInvalidated
                      )
                    }
                  />
                )}
            </Card> 
          </KeyboardAwareScrollView>
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
  statusInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 18,
  },
  qrPane: {
    flex: 1,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  codePane: {
    flex: 1,
  },
  codeResultPane: {
    flex: 1,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  codeScrollContent: {
    flexGrow: 1,
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  cardCompact: {
    gap: spacing.md,
  },
  phoneSection: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  card: { gap: spacing.md },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { color: '#fff', fontSize: 11 },
  stepText: { flex: 1, lineHeight: 20 },
  qrFrame: {
    alignSelf: 'center',
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    width: 248,
    height: 248,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  qr: { width: 220, height: 220 },
  qrHint: { textAlign: 'center' },
  codeCard: {
    borderWidth: 2,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  codePhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  codeMeta: {
    flex: 1,
  },
  codeHint: {
    lineHeight: 18,
  },
  codeLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  codeLineText: {
    flexShrink: 1,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'center',
  },
  copyIconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  codeFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    flexWrap: 'nowrap',
  },
  waitingInline: {
    flexShrink: 1,
  },
  expiredBanner: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
