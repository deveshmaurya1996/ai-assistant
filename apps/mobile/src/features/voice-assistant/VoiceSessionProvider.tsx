import { createContext, useContext, type ReactNode } from 'react';
import {
  useVoiceAssistantSession,
  type VoiceAssistantPhase,
} from './useVoiceAssistantSession';
import type { ChatMessage } from '@ai-assistant/sdk';

type VoiceSessionValue = ReturnType<typeof useVoiceAssistantSession>;

const VoiceSessionContext = createContext<VoiceSessionValue | null>(null);

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const value = useVoiceAssistantSession();
  return (
    <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>
  );
}

export function useVoiceSession(): VoiceSessionValue {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error('useVoiceSession must be used within VoiceSessionProvider');
  }
  return ctx;
}

export type { VoiceAssistantPhase, ChatMessage };
