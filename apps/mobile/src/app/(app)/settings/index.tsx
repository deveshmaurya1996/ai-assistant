import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { getVersionDisplayLines } from '@/lib/version-display';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { AssistantPickerSheet } from '@/components/settings/AssistantPickerSheet';
import { ModelPickerSheet } from '@/components/settings/ModelPickerSheet';
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
  getMicPermissionStatus,
  openAppSettings,
  type PermissionStatus,
} from '@/features/voice/requestVoicePermissions';
import {
  toggleOverlay,
  canDrawOverlays,
  requestOverlayPermission,
  setReminderOverlayEnabledNative,
} from '@/lib/overlay';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from '@/features/reminders/requestNotificationPermission';
import { registerPushTokenIfNeeded } from '@/features/reminders/registerPushToken';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';
import { isOverlayPermissionGranted } from '@/lib/overlay-settings';
import {
  formatMicPermissionStatus,
  formatOverlayPermission,
  type OverlayPermissionLabel,
} from '@/lib/permissions';
import { PressableScale } from '@/components/motion/PressableScale';
import { Routes } from '@/lib/routes';

export default function SettingsScreen() {
  const versionLines = getVersionDisplayLines();
  const { colors, mode, setMode } = useTheme();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const assistantSheetRef = useRef<BottomSheetModal>(null);
  const modelSheetRef = useRef<BottomSheetModal>(null);

  const {
    speakRepliesEnabled,
    assistantDisplayName,
    selectedPersonalityId,
    personalities,
    assistantContinuousListening,
    autoSendAfterTranscribe,
    overlayEnabled,
    lastAiModelLabel,
    preferredModelId,
    modelsCatalog,
    loadModels,
    setSpeakRepliesEnabled,
    setAssistantContinuousListening,
    setAutoSend,
    setOverlayEnabled,
    reminderOverlayEnabled,
    setReminderOverlayEnabled,
  } = useSettingsStore();

  const selectedPreset = getPersonalityPreset(selectedPersonalityId, personalities);
  const assistantSummary = `${assistantDisplayName} · ${formatGenderLabel(selectedPreset.gender)}`;
  const selectedModel = modelsCatalog?.find((m) => m.id === preferredModelId);
  const recommendedModel = modelsCatalog?.find((m) => m.recommended);
  const aiRoutingSummary = selectedModel
    ? selectedModel.label
    : recommendedModel
      ? `Auto · ${recommendedModel.label}`
      : lastAiModelLabel
        ? `Auto · ${lastAiModelLabel}`
        : 'Automatic';

  const [micStatus, setMicStatus] = useState<PermissionStatus | null>(null);
  const [overlayStatus, setOverlayStatus] = useState<OverlayPermissionLabel>('Unknown');
  const [notificationStatus, setNotificationStatus] =
    useState<NotificationPermissionStatus>('undetermined');

  const refreshOverlayPermission = useCallback(async () => {
    const overlayGranted = await isOverlayPermissionGranted();
    setOverlayStatus(formatOverlayPermission(overlayGranted));
    if (overlayEnabled && !overlayGranted) {
      await setOverlayEnabled(false);
      await toggleOverlay(false);
    }
    return overlayGranted;
  }, [overlayEnabled, setOverlayEnabled]);

  const refreshNotificationPermission = useCallback(async () => {
    const status = await getNotificationPermissionStatus();
    setNotificationStatus(status);
    return status;
  }, []);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const mic = await getMicPermissionStatus();
      setMicStatus(mic);
      await refreshOverlayPermission();
      await refreshNotificationPermission();
    })();
  }, [session, refreshOverlayPermission, refreshNotificationPermission]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      void refreshOverlayPermission();
      void refreshNotificationPermission();
      void loadModels();
    }, [session, refreshOverlayPermission, refreshNotificationPermission, loadModels])
  );

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  return (
    <Screen padded={false}>
      <ScreenHeader title="Settings" variant="page" leading="menu" titleAlign="left" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.profile, { borderBottomColor: colors.border }]}>
          <UserAvatar
            image={session?.user?.image}
            name={session?.user?.name}
            email={session?.user?.email}
            size={52}
          />
          <View style={styles.profileText}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {session?.user?.name ?? 'Guest'}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {session?.user?.email ?? '—'}
            </Text>
          </View>
        </View>

        <SettingsSection title="Appearance">
          <SegmentedControl options={themeOptions} value={mode} onChange={setMode} />
        </SettingsSection>

        <SettingsSection title="Assistant">
          <PressableScale onPress={() => modelSheetRef.current?.present()}>
            <View style={styles.row}>
              <Text variant="bodyMedium">AI model</Text>
              <View style={styles.rowEnd}>
                <Text variant="caption" muted numberOfLines={1} style={{ maxWidth: 180 }}>
                  {aiRoutingSummary}
                </Text>
                <ChevronRight color={colors.textMuted} size={18} />
              </View>
            </View>
          </PressableScale>
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

        <SettingsSection title="Notifications">
          <Text variant="bodyMedium">Reminders always notify you</Text>
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            Permission: {formatNotificationStatus(notificationStatus)}
          </Text>
          {notificationStatus !== 'granted' ? (
            <Button
              label={
                notificationStatus === 'denied'
                  ? 'Open notification settings'
                  : 'Enable notifications'
              }
              variant="secondary"
              style={{ marginTop: spacing.sm }}
              onPress={async () => {
                if (notificationStatus === 'denied') {
                  await openAppSettings();
                  return;
                }
                const status = await requestNotificationPermission();
                setNotificationStatus(status);
                if (status === 'granted') {
                  await registerPushTokenIfNeeded(reminderOverlayEnabled);
                }
              }}
            />
          ) : null}
          {Platform.OS === 'android' ? (
            <SwitchRow
              label="Reminder overlay"
              description="Show a floating bubble when a reminder fires (Android only)"
              value={reminderOverlayEnabled && overlayStatus === 'Granted'}
              onValueChange={async (v) => {
                if (v) {
                  let granted = await isOverlayPermissionGranted();
                  if (!granted) {
                    await promptOverlayPermissionIfNeeded();
                    granted = await isOverlayPermissionGranted();
                  }
                  if (!granted) return;
                }
                await setReminderOverlayEnabled(v);
                await setReminderOverlayEnabledNative(v);
                if (notificationStatus === 'granted') {
                  await registerPushTokenIfNeeded(v);
                }
              }}
            />
          ) : null}
        </SettingsSection>

        <SettingsSection title="Overlay">
          <SwitchRow
            label="Floating overlay"
            description="While on: shows overlay on other screens. In background: auto-shows during chat generation and voice."
            value={overlayEnabled && overlayStatus === 'Granted'}
            onValueChange={async (v) => {
              if (v) {
                let granted = await isOverlayPermissionGranted();
                if (!granted) {
                  await promptOverlayPermissionIfNeeded();
                  granted = await isOverlayPermissionGranted();
                }
                if (!granted) {
                  setOverlayStatus('Not granted');
                  return;
                }
                await setOverlayEnabled(true);
                await toggleOverlay(true);
                setOverlayStatus('Granted');
                return;
              }

              await setOverlayEnabled(false);
              await toggleOverlay(false);
              const ok = await isOverlayPermissionGranted();
              setOverlayStatus(ok ? 'Granted' : 'Not granted');
            }}
          />
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            Overlay permission: {overlayStatus}
          </Text>
          {overlayStatus !== 'Granted' ? (
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
          ) : null}
        </SettingsSection>

        <SettingsSection title="Memory">
          <PressableScale onPress={() => router.push(Routes.memory)}>
            <View style={styles.row}>
              <Text variant="bodyMedium">Saved facts</Text>
              <ChevronRight color={colors.textMuted} size={18} />
            </View>
          </PressableScale>
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            View and delete what your assistant remembers about you
          </Text>
        </SettingsSection>

        <SettingsSection title="Account">
          <Button
            label="Sign out"
            variant="danger"
            onPress={async () => {
              await signOut();
              router.replace('/(auth)/welcome');
            }}
          />
        </SettingsSection>

        <SettingsSection title="About">
          <Text variant="bodyMedium">AI Assistant</Text>
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            Version {versionLines.primary}
          </Text>
          {versionLines.secondary ? (
            <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
              {versionLines.secondary}
            </Text>
          ) : null}
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
      <ModelPickerSheet ref={modelSheetRef} />
    </Screen>
  );
}

function formatNotificationStatus(status: NotificationPermissionStatus): string {
  switch (status) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied — open system settings';
    default:
      return 'Not requested';
  }
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl * 2 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
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
