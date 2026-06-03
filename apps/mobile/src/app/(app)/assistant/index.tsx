import { View, StyleSheet } from 'react-native';
import { useSettingsStore } from '@/stores/settings';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { VoiceConversationView } from '@/components/assistant/VoiceConversationView';
import { AssistantStartButton } from '@/components/assistant/AssistantStartButton';
import { AssistantActiveFooter } from '@/components/assistant/AssistantActiveFooter';
import { VoiceOverlayToggle } from '@/components/assistant/VoiceOverlayToggle';
import { PressableScale } from '@/components/motion/PressableScale';
import { FadeIn } from '@/components/motion/FadeIn';
import { useVoiceSession } from '@/features/voice-assistant/VoiceSessionProvider';
import { useDockInset } from '@/hooks/useDockInset';
import { isVoiceIdleEndMessage } from '@/lib/format-ai-error';
import { spacing, radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function AssistantScreen() {
  const { colors } = useTheme();
  const { resumeSessionId } = useLocalSearchParams<{ resumeSessionId?: string }>();
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const { contentBottom } = useDockInset();

  const {
    phase,
    isActive,
    messages,
    visibleText,
    streamTurnKey,
    isStreaming,
    isGenerating,
    error,
    meteringDataPoints,
    startSession,
    resumeSession,
    stopSession,
  } = useVoiceSession();

  const canResume =
    typeof resumeSessionId === 'string' &&
    resumeSessionId.length > 0 &&
    !isActive;

  const idleEnd = error ? isVoiceIdleEndMessage(error) : false;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={assistantDisplayName}
        variant="page"
        leading="menu"
        titleAlign="left"
      />
      <View style={styles.body}>
        {isActive ? (
          <FadeIn style={styles.conversation}>
            <VoiceConversationView
              messages={messages}
              visibleText={visibleText}
              streamTurnKey={streamTurnKey}
              isStreaming={isStreaming}
              isGenerating={isGenerating}
              phase={phase}
              contentPaddingBottom={contentBottom}
            />
          </FadeIn>
        ) : (
          <View style={styles.idleCenter}>
            {error ? (
              <Text
                variant="caption"
                muted={idleEnd}
                style={[
                  styles.status,
                  idleEnd ? undefined : { color: colors.danger },
                ]}>
                {error}
              </Text>
            ) : null}
            <Text variant="body" muted style={styles.hint}>
              Tap to start a voice conversation
            </Text>
            <AssistantStartButton
              assistantName={assistantDisplayName}
              onPress={() => void startSession()}
            />
            {canResume ? (
              <PressableScale
                onPress={() => void resumeSession(resumeSessionId)}
                style={styles.resumeWrap}>
                <View style={[styles.resumeBtn, { backgroundColor: colors.primaryMuted }]}>
                  <Text variant="caption" style={{ color: colors.primary }}>
                    Continue voice chat
                  </Text>
                </View>
              </PressableScale>
            ) : null}
          </View>
        )}
      </View>

      {isActive ? (
        <>
          <VoiceOverlayToggle />
          <AssistantActiveFooter
            phase={phase}
            meteringDataPoints={meteringDataPoints}
            onStop={() => void stopSession()}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  conversation: {
    flex: 1,
  },
  idleCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  status: {
    marginBottom: spacing.md,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  hint: {
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  resumeWrap: {
    marginTop: spacing.lg,
  },
  resumeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
});
