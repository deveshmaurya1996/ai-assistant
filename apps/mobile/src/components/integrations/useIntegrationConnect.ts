import { useCallback, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { ApiError } from '@ai-assistant/sdk';
import { useRouter } from 'expo-router';
import { apiClient } from '@/lib/api-client';
import { integrationProviderRoute } from '@/lib/routes';

type BusyState = { providerId: string; action: 'connect' | 'disconnect' } | null;

export function useIntegrationConnect(onConnectionsChanged?: () => void | Promise<void>) {
  const router = useRouter();
  const [busy, setBusy] = useState<BusyState>(null);

  const showError = useCallback((title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }, []);

  const connectProvider = useCallback(
    async (providerId: string) => {
      setBusy({ providerId, action: 'connect' });
      try {
        const challenge = await apiClient.connectProvider(providerId);
        if (challenge.type === 'oauth' && challenge.url) {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.location.href = challenge.url;
          } else {
            await Linking.openURL(challenge.url);
          }
        } else if (providerId === 'whatsapp' && challenge.connectionId) {
          if (challenge.state === 'ready') {
            await onConnectionsChanged?.();
            return;
          }
          router.push(
            integrationProviderRoute(providerId, {
              connectionId: challenge.connectionId,
            })
          );
        } else if (challenge.type === 'local') {
          await onConnectionsChanged?.();
        }
      } catch (e) {
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Could not start connection';
        showError('Connect failed', message);
      } finally {
        setBusy(null);
      }
    },
    [onConnectionsChanged, router, showError]
  );

  const handleIntegrationAction = useCallback(
    async (providerId: string, action: 'connect' | 'reconnect') => {
      if (action === 'reconnect' && Platform.OS !== 'web') {
        Alert.alert('Reconnect app', 'Open the linking flow to restore access.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reconnect', onPress: () => void connectProvider(providerId) },
        ]);
        return;
      }
      await connectProvider(providerId);
    },
    [connectProvider]
  );

  return {
    busy,
    connectProvider,
    handleIntegrationAction,
  };
}
