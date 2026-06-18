import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSettingsStore } from '@/stores/settings';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppNavigationGestureHost } from '@/components/layout/AppNavigationGestureHost';
import { VoiceConversationView } from '@/components/assistant/VoiceConversationView';
import { AssistantVoiceVisualizer } from '@/components/assistant/AssistantVoiceVisualizer';
import { AssistantVoiceToolbar } from '@/components/assistant/AssistantVoiceToolbar';
import { AssistantVoiceFooter } from '@/components/assistant/AssistantActiveFooter';
import { useVoiceSession } from '@/features/voice-assistant/VoiceSessionProvider';
import { isVoiceIdleEndMessage } from '@/lib/format-ai-error';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { useRequiredPermissions } from '@/hooks/useRequiredPermissions';

export default function AssistantScreen() {
  useRequiredPermissions();
  const { colors, screenStyle } = useTheme();
  const { resumeSessionId } = useLocalSearchParams<{ resumeSessionId?: string }>();
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const [showChat, setShowChat] = useState(false);
  const autoResumedRef = useRef(false);

  const {
    phase,
    isActive,
    messages,
    visibleText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    streamRevision,
    error,
    startSession,
    resumeSession,
    stopSession,
    liveKitToken,
  } = useVoiceSession();

  const idleEnd = error ? isVoiceIdleEndMessage(error) : false;
  const roomReady = Boolean(liveKitToken);
  const chatVisible = showChat && isActive;

  useEffect(() => {
    if (isActive) {
      setShowChat(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (
      autoResumedRef.current ||
      isActive ||
      typeof resumeSessionId !== 'string' ||
      !resumeSessionId.length
    ) {
      return;
    }
    autoResumedRef.current = true;
    void resumeSession(resumeSessionId);
  }, [isActive, resumeSession, resumeSessionId]);

  return (
    <AppNavigationGestureHost>
      <View style={[styles.root, screenStyle]}>
        <ScreenHeader
          title={assistantDisplayName}
          variant="page"
          leading="menu"
          titleAlign="left"
        />

        {isActive ? (
          <AssistantVoiceToolbar
            showChat={showChat}
            onShowChatChange={setShowChat}
          />
        ) : null}

        <View style={styles.body}>
          {chatVisible ? (
            <View style={styles.chatPane}>
              <VoiceConversationView
                messages={messages}
                visibleText={visibleText}
                streamTurnKey={streamTurnKey}
                isStreaming={isStreaming}
                isGenerating={isGenerating}
                streamRevision={streamRevision}
                phase={phase}
                contentPaddingBottom={spacing.sm}
              />
            </View>
          ) : null}

          <View
            style={[
              styles.visualizerPane,
              chatVisible ? styles.visualizerPaneWithChat : null,
            ]}
          >
            <AssistantVoiceVisualizer
              roomReady={roomReady}
              isActive={isActive}
              phase={phase}
            />
            {!isActive ? (
              <Text variant="body" muted style={styles.hint}>
                {error ? null : 'Press Start to talk'}
              </Text>
            ) : null}
            {error ? (
              <Text
                variant="caption"
                muted={idleEnd}
                style={[
                  styles.status,
                  idleEnd ? undefined : { color: colors.danger },
                ]}
              >
                {error}
              </Text>
            ) : null}
          </View>
        </View>

        <AssistantVoiceFooter
          isActive={isActive}
          phase={phase}
          onStart={() => void startSession()}
          onStop={() => void stopSession('user-stop')}
        />
      </View>
    </AppNavigationGestureHost>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  chatPane: {
    flex: 1,
    minHeight: 140,
    paddingTop: spacing.xs,
  },
  visualizerPane: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  visualizerPaneWithChat: {
    flex: 0,
    minHeight: 100,
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
  },
  hint: {
    textAlign: 'center',
  },
  status: {
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
