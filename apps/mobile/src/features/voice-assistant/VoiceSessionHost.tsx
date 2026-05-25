import type { ReactNode } from 'react';
import { VoiceSessionProvider } from './VoiceSessionProvider';

export function VoiceSessionHost({ children }: { children: ReactNode }) {
  return <VoiceSessionProvider>{children}</VoiceSessionProvider>;
}
