import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppHeader } from '@/components/layout/AppHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { AssistantPickerSheet } from '@/components/settings/AssistantPickerSheet';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeMode } from '@/theme/tokens';
import { spacing } from '@/theme/tokens';
import {
  useSettingsStore,
  formatGenderLabel,
  getPersonalityPreset,
} from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import {
  requestMicPermission,
  openAppSettings,
  type PermissionStatus,
} from '@/features/voice/requestVoicePermissions';
import {
  toggleOverlay,
  canDrawOverlays,
  requestOverlayPermission,
} from '@/lib/overlay';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';
import {
  formatMicPermissionStatus,
  formatOverlayPermission,
  type OverlayPermissionLabel,
} from '@/lib/permissions';
import { PressableScale } from '@/components/motion/PressableScale';

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const assistantSheetRef = useRef<BottomSheetModal>(null);

  const {
    speakRepliesEnabled,
    assistantDisplayName,
    selectedPersonalityId,
    personalities,
    assistantContinuousListening,
    autoSendAfterTranscribe,
    overlayEnabled,
    lastAiModelLabel,
    setSpeakRepliesEnabled,
    setAssistantContinuousListening,
    setAutoSend,
    setOverlayEnabled,
  } = useSettingsStore();

  const selectedPreset = getPersonalityPreset(selectedPersonalityId, personalities);
  const assistantSummary = `${assistantDisplayName} · ${formatGenderLabel(selectedPreset.gender)}`;
  const aiRoutingSummary = lastAiModelLabel
    ? `Auto · ${lastAiModelLabel}`
    : 'Automatic';

  const [micStatus, setMicStatus] = useState<PermissionStatus | null>(null);
  const [overlayStatus, setOverlayStatus] = useState<OverlayPermissionLabel>('Unknown');

  useEffect(() => {
    void (async () => {
      const mic = await requestMicPermission();
      setMicStatus(mic);
      const overlayGranted = await canDrawOverlays();
      setOverlayStatus(formatOverlayPermission(overlayGranted));
    })();
  }, []);

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  return (
    <Screen padded={false}>
      <AppHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <SettingsSection title="Appearance">
          <SegmentedControl options={themeOptions} value={mode} onChange={setMode} />
        </SettingsSection>

        <SettingsSection title="Assistant">
          <View style={styles.row}>
            <Text variant="bodyMedium">AI routing</Text>
            <Text variant="caption" muted numberOfLines={1} style={{ maxWidth: 180 }}>
              {aiRoutingSummary}
            </Text>
          </View>
          <PressableScale onPress={() => assistantSheetRef.current?.present()}>
            <View style={styles.row}>
              <Text variant="bodyMedium">Your assistant</Text>
              <View style={styles.rowEnd}>
                <Text variant="caption" muted numberOfLines={1} style={{ maxWidth: 160 }}>
                  {assistantSummary}
                </Text>
                <ChevronRight color={colors.textMuted} size={18} />
              </View>
            </View>
          </PressableScale>
        </SettingsSection>

        <SettingsSection title="Voice behavior">
          <SwitchRow
            label="Speak replies"
            description="When off, replies appear as text and overlay only"
            value={speakRepliesEnabled}
            onValueChange={(v) => void setSpeakRepliesEnabled(v)}
          />
        </SettingsSection>

        <SettingsSection title="Voice">
          <SwitchRow
            label="Keep listening"
            description="Assistant stays active and keeps listening between turns. When off, voice chat ends after inactivity."
            value={assistantContinuousListening}
            onValueChange={(v) => void setAssistantContinuousListening(v)}
          />
          <SwitchRow
            label="Auto-send after transcribe"
            description="Send message immediately from Assistant tab"
            value={autoSendAfterTranscribe}
            onValueChange={(v) => void setAutoSend(v)}
          />
          <View style={styles.statusRow}>
            <Text variant="caption" muted>
              Microphone:{' '}
              {micStatus ? formatMicPermissionStatus(micStatus) : 'Unknown'}
            </Text>
            <Button label="Open settings" variant="ghost" onPress={openAppSettings} />
          </View>
        </SettingsSection>

        <SettingsSection title="Overlay">
          <SwitchRow
            label="Floating overlay"
            description="While on: shows chat and voice replies in-app. In background: auto-shows AI responses with chat title. Tap corner when minimized to close."
            value={overlayEnabled}
            onValueChange={async (v) => {
              if (v) {
                const granted = await canDrawOverlays();
                if (!granted) {
                  await promptOverlayPermissionIfNeeded();
                }
              }
              await setOverlayEnabled(v);
              await toggleOverlay(v);
              const ok = await canDrawOverlays();
              setOverlayStatus(ok ? 'Granted' : 'Not granted');
            }}
          />
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            Overlay permission: {overlayStatus}
          </Text>
          <Button
            label="Grant overlay permission"
            variant="secondary"
            style={{ marginTop: spacing.sm }}
            onPress={async () => {
              await requestOverlayPermission();
              const ok = await canDrawOverlays();
              setOverlayStatus(ok ? 'Granted' : 'Not granted');
            }}
          />
        </SettingsSection>

        <SettingsSection title="Account">
          <Text variant="body" muted>
            {session?.user?.email ?? '—'}
          </Text>
          <Button
            label="Sign out"
            variant="danger"
            style={{ marginTop: spacing.md }}
            onPress={async () => {
              await signOut();
              router.replace('/(auth)/welcome');
            }}
          />
        </SettingsSection>

        <SettingsSection title="About">
          <Text variant="bodyMedium">AI Assistant</Text>
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            Version {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
          <Button
            label="Terms & Privacy"
            variant="secondary"
            style={{ marginTop: spacing.md }}
            onPress={() => router.push('/(auth)/terms')}
          />
          <Text variant="caption" muted style={{ marginTop: spacing.md }}>
            © {new Date().getFullYear()} AI Assistant
          </Text>
        </SettingsSection>
      </ScrollView>
      <AssistantPickerSheet ref={assistantSheetRef} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, paddingBottom: 160 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
});
