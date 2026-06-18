import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import type { LiveKitTokenResponse } from '@ai-assistant/types';
import { apiClient } from '@/lib/api-client';
import { resolveLiveKitUrlForDevice } from '@/lib/config';

export function useLiveKitVoiceSession() {
  const [tokenInfo, setTokenInfo] = useState<LiveKitTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectSeqRef = useRef(0);
  const mountedRef = useRef(true);

  const disconnect = useCallback(async () => {
    connectSeqRef.current += 1;
    if (mountedRef.current) {
      setTokenInfo(null);
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {
      /* ignore */
    }
  }, []);

  const connect = useCallback(
    async (options?: { chatSessionId?: string; personalityId?: string }) => {
      const seq = ++connectSeqRef.current;
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

        if (!mountedRef.current || seq !== connectSeqRef.current) {
          try {
            await AudioSession.stopAudioSession();
          } catch {
            /* ignore */
          }
          throw new Error('Voice connection superseded by a newer session attempt');
        }

        setTokenInfo(info);
        return info;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not connect to voice';
        if (mountedRef.current) {
          setError(message);
        }
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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