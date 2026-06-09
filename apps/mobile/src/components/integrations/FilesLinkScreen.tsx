import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, Switch } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ApiError } from '@ai-assistant/sdk';
import type { DeviceFilesSource, DeviceFilesStatus } from '@ai-assistant/types';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppHeader } from '@/components/layout/AppHeader';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { apiClient } from '@/lib/api-client';
import { runLocalFileSync } from '@/features/local-files/localFileSync';
import { useDeviceFilesSyncStore } from '@/features/local-files/deviceFilesSyncStore';
import type { LocalFileSyncProgress } from '@/features/local-files/types';

type Props = {
  connectionId: string;
};

const SOURCE_LABELS: Record<DeviceFilesSource, string> = {
  documents: 'Documents & PDFs',
  photos: 'Photos on phone',
};

export function FilesLinkScreen({ connectionId }: Props) {
  const router = useRouter();
  const { colors, screenStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<DeviceFilesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [localProgress, setLocalProgress] = useState<LocalFileSyncProgress | null>(null);
  const [enabledSources, setEnabledSources] = useState<DeviceFilesSource[]>([
    'documents',
    'photos',
  ]);
  const [autoSyncPhotos, setAutoSyncPhotos] = useState(true);

  const storeProgress = useDeviceFilesSyncStore((s) => s.progress);
  const storeSyncing = useDeviceFilesSyncStore((s) => s.syncInProgress);
  const progress = syncing ? localProgress : storeSyncing ? storeProgress : localProgress;

  const load = useCallback(async () => {
    try {
      const next = await apiClient.getDeviceFilesStatus();
      setStatus(next);
      setEnabledSources(next.config.enabledSources);
      setAutoSyncPhotos(next.config.syncEnabled);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSource = (source: DeviceFilesSource) => {
    setEnabledSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const persistAutoSync = async (next: boolean) => {
    setAutoSyncPhotos(next);
    try {
      await apiClient.updateDeviceFilesConfig({ syncEnabled: next });
      await load();
    } catch (e) {
      setAutoSyncPhotos(!next);
      const message = e instanceof ApiError ? e.message : 'Could not update settings';
      Alert.alert('Update failed', message);
    }
  };

  const finishSetup = useCallback(async () => {
    try {
      await apiClient.activateConnection(connectionId);
      router.replace('/(app)/integrations');
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not activate Files';
      Alert.alert('Setup failed', message);
    }
  }, [connectionId, router]);

  const runManualSync = async (afterSetup: boolean) => {
    if (enabledSources.length === 0) {
      Alert.alert('Choose sources', 'Enable at least one source to sync.');
      return;
    }
    setSyncing(true);
    setLocalProgress(null);
    try {
      await apiClient.updateDeviceFilesConfig({
        enabledSources,
        syncEnabled: autoSyncPhotos,
      });
      const result = await runLocalFileSync({
        enabledSources,
        since: status?.lastSyncAt,
        onProgress: setLocalProgress,
      });
      await load();
      if (result.phase === 'done' && afterSetup) {
        await finishSetup();
      } else if (result.phase === 'error') {
        Alert.alert('Sync failed', result.message ?? 'Try again');
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Sync failed';
      Alert.alert('Sync failed', message);
    } finally {
      setSyncing(false);
      setLocalProgress(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, screenStyle]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const stats = status?.stats;
  const isSetup = status?.connected !== true;
  const lastStats = status?.config.lastSyncStats;
  const showProgress = Boolean(progress && (syncing || storeSyncing));

  return (
    <View style={[styles.root, screenStyle]}>
      <AppHeader title="Phone files" leading="back" />
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <View style={styles.hero}>
          <ProviderIcon providerId="files" size="md" />
          <Text variant="h2" style={styles.heroTitle}>
            {isSetup ? 'Link phone storage' : 'Phone files'}
          </Text>
          <Text variant="body" muted style={styles.heroSub}>
            {isSetup
              ? 'Choose what to share with the assistant. Photos can auto-sync while the app is open; documents are added when you pick them.'
              : 'Synced files are searchable in chat alongside uploads and Google Drive. New photos sync automatically while the app is open.'}
          </Text>
        </View>

        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text variant="body">Auto-sync photos</Text>
              <Text variant="caption" muted>
                Checks for new gallery photos every 15 minutes while the app is open
              </Text>
            </View>
            <Switch
              value={autoSyncPhotos}
              onValueChange={(value) => void persistAutoSync(value)}
              disabled={syncing || storeSyncing}
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text variant="label" style={styles.sectionLabel}>
            Sync from
          </Text>
          {(Object.keys(SOURCE_LABELS) as DeviceFilesSource[]).map((source) => (
            <View key={source} style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="body">{SOURCE_LABELS[source]}</Text>
                <Text variant="caption" muted>
                  {source === 'documents'
                    ? 'Pick PDFs and documents when you tap Sync'
                    : 'All gallery photos on first sync, then new photos only'}
                </Text>
              </View>
              <Switch
                value={enabledSources.includes(source)}
                onValueChange={() => toggleSource(source)}
                disabled={syncing || storeSyncing}
              />
            </View>
          ))}
        </Card>

        {stats ? (
          <Card style={styles.card}>
            <Text variant="label" style={styles.sectionLabel}>
              Library
            </Text>
            <Text variant="body">
              {stats.deviceFilesIndexed} device files indexed · {stats.searchableFilesTotal}{' '}
              searchable total
            </Text>
            {status?.lastSyncAt ? (
              <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
                Last sync {new Date(status.lastSyncAt).toLocaleString()}
              </Text>
            ) : null}
            {lastStats ? (
              <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
                Last run: {lastStats.uploaded} uploaded · {lastStats.skipped} unchanged ·{' '}
                {lastStats.failed} failed
              </Text>
            ) : null}
          </Card>
        ) : null}

        {showProgress && progress ? (
          <Card style={styles.card}>
            <Text variant="label">
              {progress.phase === 'scanning' ? 'Scanning…' : 'Syncing…'}
            </Text>
            {progress.message ? (
              <Text variant="caption" muted>
                {progress.message}
              </Text>
            ) : null}
            {progress.current ? (
              <Text variant="caption" numberOfLines={1}>
                {progress.current}
              </Text>
            ) : null}
            <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
              {progress.uploaded} uploaded · {progress.skipped} unchanged · {progress.failed}{' '}
              failed
              {progress.total > 0 ? ` · ${progress.total} scanned` : ''}
            </Text>
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
          </Card>
        ) : null}

        <Button
          label={isSetup ? 'Sync & enable' : 'Sync now'}
          onPress={() => void runManualSync(isSetup)}
          loading={syncing}
          disabled={storeSyncing && !syncing}
          style={{ marginTop: spacing.md }}
        />

        {!isSetup ? (
          <Button
            label="Done"
            variant="secondary"
            onPress={() => router.back()}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.md, gap: spacing.md },
  hero: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  heroTitle: { textAlign: 'center' },
  heroSub: { textAlign: 'center', paddingHorizontal: spacing.md },
  card: { gap: spacing.sm, borderRadius: radii.lg },
  sectionLabel: { marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  rowText: { flex: 1, gap: 2 },
});
