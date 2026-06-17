import { createContext, useContext, useCallback, type ReactNode } from 'react';
import {
  useVoiceAssistantSession,
  type VoiceAssistantPhase,
} from './useVoiceAssistantSession';
import { VoiceLiveKitRoom } from '@/features/voice-live/VoiceLiveKitRoom';
import type { ChatMessage } from '@ai-assistant/sdk';

type VoiceSessionValue = ReturnType<typeof useVoiceAssistantSession>;

const VoiceSessionContext = createContext<VoiceSessionValue | null>(null);

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const value = useVoiceAssistantSession();
  const { isActive, stopSession, liveKitToken, setAgentPhase, setAgentTranscript, setUserTranscript, onMessagesTick } = value;

  const handleDisconnected = useCallback(() => {
    if (isActive) {
      void stopSession('livekit-disconnected');
    }
  }, [isActive, stopSession]);

  return (
    <VoiceSessionContext.Provider value={value}>
      <VoiceLiveKitRoom
        tokenInfo={liveKitToken}
        isActive={isActive}
        onAgentPhase={setAgentPhase}
        onAgentTranscript={setAgentTranscript}
        onUserTranscript={setUserTranscript}
        onMessagesTick={onMessagesTick}
        onDisconnected={handleDisconnected}
      >
        {children}
      </VoiceLiveKitRoom>
    </VoiceSessionContext.Provider>
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
