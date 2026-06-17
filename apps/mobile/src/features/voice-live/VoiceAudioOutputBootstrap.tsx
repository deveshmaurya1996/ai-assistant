import { useEffect } from 'react';
import { Platform } from 'react-native';
import { AudioSession } from '@livekit/react-native';

type Props = {
  enabled: boolean;
};

const PREFERRED_OUTPUTS = ['bluetooth', 'headset'] as const;
const POLL_MS = 1_000;
const POLL_ATTEMPTS = 20;

async function pickPreferredOutput(outputs: string[]): Promise<string | null> {
  for (const deviceId of PREFERRED_OUTPUTS) {
    if (outputs.includes(deviceId)) return deviceId;
  }
  return null;
}

export function VoiceAudioOutputBootstrap({ enabled }: Props) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    const routeAudio = async (reason: string): Promise<string | null> => {
      if (cancelled || Platform.OS !== 'android') return null;

      const outputs = await AudioSession.getAudioOutputs().catch(() => [] as string[]);
      const preferred = await pickPreferredOutput(outputs);

      if (preferred) {
        await AudioSession.selectAudioOutput(preferred);
      }

      return preferred;
    };

    void (async () => {
      try {
        await AudioSession.setDefaultRemoteAudioTrackVolume(1);
        const initial = await routeAudio('initial');
        if (initial || cancelled) return;

        timer = setInterval(() => {
          attempts += 1;
          void routeAudio('poll').then((preferred) => {
            if (preferred || attempts >= POLL_ATTEMPTS) {
              if (timer) clearInterval(timer);
            }
          });
        }, POLL_MS);
      } catch {
        /* ignore routing errors */
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [enabled]);

  return null;
}
