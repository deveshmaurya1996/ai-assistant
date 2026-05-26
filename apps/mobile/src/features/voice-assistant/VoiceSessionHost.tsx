import type { ReactNode } from 'react';
import { AudioRecorderProvider } from '@siteed/audio-studio';
import { VoiceSessionProvider } from './VoiceSessionProvider';

export function VoiceSessionHost({ children }: { children: ReactNode }) {
  return (
    <AudioRecorderProvider>
      <VoiceSessionProvider>{children}</VoiceSessionProvider>
    </AudioRecorderProvider>
  );
}
