import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Check, Copy } from 'lucide-react-native';
import { ApiError } from '@ai-assistant/sdk';
import type { WhatsAppSessionStatus } from '@ai-assistant/types';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { AppHeader } from '@/components/layout/AppHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';

type LinkMode = 'qr' | 'code';

type Props = {
  connectionId: string;
};

const STEPS_QR = [
  'Open WhatsApp on your phone',
  'Go to Settings → Linked devices → Link a device',
  'Point your camera at the QR code below',
];

const STEPS_CODE = [
  'Enter your phone number with country code (no + sign)',
  'Tap Get pairing code below',
  'On your phone: Linked devices → Link with phone number → enter the 8-character code',
];

export function WhatsAppLinkScreen({ connectionId }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const [mode, setMode] = useState<LinkMode>('qr');
  const [session, setSession] = useState<WhatsAppSessionStatus | null>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);
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
      setSession(data);
      if (data.status === 'active') {
        await finishLink();
      }
    } catch {
      /* polling */
    } finally {
      setLoading(false);
    }
  }, [connectionId, finishLink]);

  useEffect(() => {
    void refreshSession();
    const interval = setInterval(() => {
      void refreshSession();
    }, 2500);
    return () => clearInterval(interval);
  }, [refreshSession]);

  const handleCopyPairingCode = async () => {
    if (!session?.pairingCode) return;
    const raw = session.pairingCode.replace(/[^A-Za-z0-9]/gi, '');
    await Clipboard.setStringAsync(raw);
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
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      Alert.alert('Invalid number', 'Enter your full number with country code, digits only.');
      return;
    }
    setPairingLoading(true);
    try {
      const data = await apiClient.requestWhatsAppPairing(connectionId, digits);
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

  return (
    <Screen padded={false}>
      <AppHeader title="Link WhatsApp" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: '#25D36622' }]}>
            <ProviderIcon providerId="whatsapp" size="md" />
          </View>
          <Text variant="h2" style={styles.heroTitle}>
            Connect WhatsApp
          </Text>
          <Text variant="caption" muted style={styles.heroSub}>
            Link this device so your assistant can read and send messages securely.
          </Text>
        </View>

        <SegmentedControl options={modeOptions} value={mode} onChange={setMode} />

        {loading && !session?.qrData ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#25D366" />
            <Text variant="caption" muted style={{ marginTop: spacing.sm }}>
              Generating secure link…
            </Text>
          </View>
        ) : null}

        {mode === 'qr' ? (
          <Card style={styles.card}>
            <Text variant="label" muted style={styles.sectionLabel}>
              Scan QR code
            </Text>
            {STEPS_QR.map((step, i) => (
              <View key={step} style={styles.stepRow}>
                <View style={[styles.stepNum, { backgroundColor: '#25D366' }]}>
                  <Text variant="label" style={{ color: '#fff' }}>
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
          </Card>
        ) : (
          <Card style={styles.card}>
            <Text variant="label" muted style={styles.sectionLabel}>
              Pair with phone number
            </Text>
            {STEPS_CODE.map((step, i) => (
              <View key={step} style={styles.stepRow}>
                <View style={[styles.stepNum, { backgroundColor: '#25D366' }]}>
                  <Text variant="label" style={{ color: '#fff' }}>
                    {i + 1}
                  </Text>
                </View>
                <Text variant="caption" style={styles.stepText}>
                  {step}
                </Text>
              </View>
            ))}
            <Text variant="caption" muted>
              Example: US 15551234567 · India 919876543210
            </Text>
            <Input
              value={phone}
              onChangeText={setPhone}
              placeholder="Country code + number"
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            <Button
              label={pairingLoading ? 'Getting code…' : 'Get pairing code'}
              variant="primary"
              loading={pairingLoading}
              disabled={pairingLoading}
              style={{ backgroundColor: '#25D366' }}
              onPress={() => void handleRequestPairing()}
            />
            {session?.pairingCode ? (
              <View style={[styles.codeBox, { borderColor: '#25D366', backgroundColor: '#25D36611' }]}>
                <Text variant="caption" muted>
                  Enter this code on your phone
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
                  accessibilityLabel="Copy pairing code"
                >
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
        )}

        {finishing ? (
          <View style={styles.linkedRow}>
            <ActivityIndicator color="#25D366" />
            <Text variant="bodyMedium" style={{ color: '#25D366' }}>
              WhatsApp linked — finishing setup…
            </Text>
          </View>
        ) : (
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => router.back()}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.md,
    paddingBottom: 140,
    gap: spacing.md,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  heroIcon: {
    padding: spacing.sm,
    borderRadius: radii.full,
  },
  heroTitle: { textAlign: 'center' },
  heroSub: { textAlign: 'center', paddingHorizontal: spacing.md },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  card: { gap: spacing.md },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.6 },
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
  },
  stepText: { flex: 1, lineHeight: 20 },
  qrFrame: {
    alignSelf: 'center',
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    minHeight: 280,
    minWidth: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: { width: 256, height: 256 },
  qrHint: { textAlign: 'center' },
  codeBox: {
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
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
    paddingVertical: spacing.md,
  },
});
