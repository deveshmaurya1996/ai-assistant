import { useEffect, useMemo, useRef, useState } from 'react';
import { useSegments } from 'expo-router';
import { AppState, type AppStateStatus } from 'react-native';
import {
  hideOverlayPanel,
  subscribeOverlayDismissed,
  syncAssistantOverlay,
} from '@/lib/overlay';
import { useChatStreamStore } from '@/features/chat/chatStreamStore';
import { useSettingsStore } from '@/stores/settings';
import { useVoiceSession } from '@/features/voice-assistant/VoiceSessionProvider';
import { useOverlaySessionStore } from './overlaySessionStore';
import { buildOverlayActivities } from './buildOverlayActivities';
import {
  resolveCurrentChatSessionKey,
  resolveOverlayForegroundScreen,
} from './resolveOverlayRoute';

const ROTATION_MS = 5000;
const STREAM_OVERLAY_TICK_MS = 400;

function selectGeneratingSignature(
  keys: Record<string, true>
): string {
  return Object.keys(keys).sort().join(',');
}

export function useAssistantOverlaySync() {
  const overlayEnabled = useSettingsStore((s) => s.overlayEnabled);
  const voiceOverlayEnabled = useSettingsStore((s) => s.voiceOverlayEnabled);
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const userDismissed = useOverlaySessionStore((s) => s.userDismissed);
  const setUserDismissed = useOverlaySessionStore((s) => s.setUserDismissed);
  const lastReplies = useOverlaySessionStore((s) => s.lastReplies);
  const segments = useSegments();
  const foregroundScreen = useMemo(
    () => resolveOverlayForegroundScreen(segments),
    [segments]
  );
  const currentChatSessionKey = useMemo(
    () => resolveCurrentChatSessionKey(segments),
    [segments]
  );
  const generatingSignature = useChatStreamStore((s) =>
    selectGeneratingSignature(s.generatingSessionKeys)
  );
  const [streamOverlayTick, setStreamOverlayTick] = useState(0);

  const { phase, isActive, visibleText, sessionId } = useVoiceSession();

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [activeIndex, setActiveIndex] = useState(0);

  const voiceTitle = useOverlaySessionStore((s) =>
    sessionId ? s.sessions[sessionId]?.title : undefined
  );

  useEffect(() => {
    if (!generatingSignature) return;
    const timer = setInterval(() => {
      setStreamOverlayTick((tick) => tick + 1);
    }, STREAM_OVERLAY_TICK_MS);
    return () => clearInterval(timer);
  }, [generatingSignature]);

  const activities = useMemo(
    () =>
      buildOverlayActivities({
        chatSessions: useChatStreamStore.getState().sessions,
        assistantName: assistantDisplayName,
        voicePhase: phase,
        voiceSessionId: sessionId,
        voiceAssistantText: visibleText,
        voiceTitle,
        appState,
        lastReplies,
      }),
    [
      generatingSignature,
      streamOverlayTick,
      assistantDisplayName,
      phase,
      sessionId,
      visibleText,
      voiceTitle,
      appState,
      lastReplies,
    ]
  );

  const visibleActivities = useMemo(() => {
    if (foregroundScreen !== 'chat' || !currentChatSessionKey) {
      return activities;
    }
    return activities.filter(
      (a) => a.kind === 'voice' || a.sessionKey === currentChatSessionKey
    );
  }, [activities, foregroundScreen, currentChatSessionKey]);

  const activitiesKey = visibleActivities.map((a) => a.sessionKey).join(',');

  useEffect(() => {
    setActiveIndex(0);
  }, [activitiesKey]);

  useEffect(() => {
    if (visibleActivities.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % visibleActivities.length);
    }, ROTATION_MS);
    return () => clearInterval(timer);
  }, [visibleActivities.length, activitiesKey]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      setAppState(next);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return subscribeOverlayDismissed(() => {
      setUserDismissed(true);
      void hideOverlayPanel();
    });
  }, [setUserDismissed]);

  const safeIndex =
    visibleActivities.length > 0 ? activeIndex % visibleActivities.length : 0;
  const activeItem = visibleActivities[safeIndex] ?? null;
  const rotationHint =
    visibleActivities.length > 1
      ? `${safeIndex + 1} of ${visibleActivities.length}`
      : undefined;

  useEffect(() => {
    void syncAssistantOverlay({
      appState,
      overlayEnabled,
      voiceOverlayEnabled,
      userDismissed,
      activeItem,
      rotationHint,
      foregroundScreen,
      currentChatSessionKey,
    });
  }, [
    appState,
    overlayEnabled,
    voiceOverlayEnabled,
    userDismissed,
    activeItem,
    rotationHint,
    foregroundScreen,
    currentChatSessionKey,
  ]);
}
