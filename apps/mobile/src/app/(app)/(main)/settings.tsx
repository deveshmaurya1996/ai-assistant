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
import { ModelPickerSheet } from '@/components/settings/ModelPickerSheet';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeMode } from '@/theme/tokens';
import { spacing } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settings';
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
import { API_URL } from '@/lib/config';
import { PressableScale } from '@/components/motion/PressableScale';

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const modelSheetRef = useRef<BottomSheetModal>(null);

  const {
    preferredModel,
    backgroundVoiceEnabled,
    autoSendAfterTranscribe,
    defaultRagEnabled,
    overlayEnabled,
    setBackgroundVoice,
    setAutoSend,
    setDefaultRag,
    setOverlayEnabled,
    loadPreferredModelFromApi,
  } = useSettingsStore();

  const [micStatus, setMicStatus] = useState<PermissionStatus | null>(null);
  const [overlayStatus, setOverlayStatus] = useState<OverlayPermissionLabel>('Unknown');

  useEffect(() => {
    void (async () => {
      await loadPreferredModelFromApi();
      const mic = await requestMicPermission();
      setMicStatus(mic);
      const overlayGranted = await canDrawOverlays();
      setOverlayStatus(formatOverlayPermission(overlayGranted));
    })();
  }, [loadPreferredModelFromApi]);

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
          <PressableScale onPress={() => modelSheetRef.current?.present()}>
            <View style={styles.row}>
              <Text variant="bodyMedium">Preferred model</Text>
              <View style={styles.rowEnd}>
                <Text variant="caption" muted numberOfLines={1} style={{ maxWidth: 140 }}>
                  {preferredModel ?? 'Default'}
                </Text>
                <ChevronRight color={colors.textMuted} size={18} />
              </View>
            </View>
          </PressableScale>
        </SettingsSection>

        <SettingsSection title="Voice">
          <SwitchRow
            label="Background recording"
            description="Record while app is minimized (Android)"
            value={backgroundVoiceEnabled}
            onValueChange={(v) => void setBackgroundVoice(v)}
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
            label="Floating assistant bubble"
            description="Show bubble over other apps (Android dev build)"
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

        <SettingsSection title="Chat">
          <SwitchRow
            label="RAG by default"
            description="Use memory context in new messages"
            value={defaultRagEnabled}
            onValueChange={(v) => void setDefaultRag(v)}
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

        <SettingsSection title="Legal">
          <Button
            label="Terms & Privacy"
            variant="secondary"
            onPress={() => router.push('/(auth)/terms')}
          />
        </SettingsSection>

        <SettingsSection title="About">
          <Text variant="caption" muted>
            Version {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
          {__DEV__ ? (
            <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
              API: {API_URL}
            </Text>
          ) : null}
        </SettingsSection>
      </ScrollView>
      <ModelPickerSheet ref={modelSheetRef} />
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
