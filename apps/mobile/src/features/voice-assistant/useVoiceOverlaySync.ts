import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { syncVoiceOverlay } from '@/lib/overlay';
import type { VoiceAssistantPhase } from './useVoiceAssistantSession';

type Options = {
  phase: VoiceAssistantPhase;
  sessionActive: boolean;
  assistantText?: string;
  assistantDisplayName?: string;
};

export function useVoiceOverlaySync({
  phase,
  sessionActive,
  assistantText = '',
  assistantDisplayName = 'Assistant',
}: Options) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      void syncVoiceOverlay({
        phase,
        assistantText,
        appState: next,
        sessionActive,
        assistantDisplayName,
      });
    });
    return () => sub.remove();
  }, [phase, sessionActive, assistantText, assistantDisplayName]);

  useEffect(() => {
    void syncVoiceOverlay({
      phase,
      assistantText,
      appState: appStateRef.current,
      sessionActive,
      assistantDisplayName,
    });
  }, [phase, sessionActive, assistantText, assistantDisplayName]);
}
