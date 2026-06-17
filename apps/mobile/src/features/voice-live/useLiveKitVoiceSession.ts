import { useCallback, useEffect, useState } from 'react';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import type { LiveKitTokenResponse } from '@ai-assistant/types';
import { apiClient } from '@/lib/api-client';
import { resolveLiveKitUrlForDevice } from '@/lib/config';

export function useLiveKitVoiceSession() {
  const [tokenInfo, setTokenInfo] = useState<LiveKitTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disconnect = useCallback(async () => {
    setTokenInfo(null);
    try {
      await AudioSession.stopAudioSession();
    } catch {
      /* ignore */
    }
  }, []);

  const connect = useCallback(
    async (options?: { chatSessionId?: string; personalityId?: string }) => {
      setError(null);
      try {
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ['bluetooth', 'headset', 'speaker', 'earpiece'],
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
        });
        await AudioSession.setDefaultRemoteAudioTrackVolume(1);
        await AudioSession.startAudioSession();
        const raw = await apiClient.getVoiceLiveToken({
          chatSessionId: options?.chatSessionId,
          personalityId: options?.personalityId,
        });
        const info = {
          ...raw,
          livekitUrl: resolveLiveKitUrlForDevice(raw.livekitUrl),
        };
        setTokenInfo(info);
        return info;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not connect to voice';
        setError(message);
        try {
          await AudioSession.stopAudioSession();
        } catch {
          /* ignore */
        }
        throw e;
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    tokenInfo,
    error,
    isConnected: Boolean(tokenInfo),
  };
}
