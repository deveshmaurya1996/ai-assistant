import { View, StyleSheet } from 'react-native';
import { useSettingsStore } from '@/stores/settings';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { AppHeader } from '@/components/layout/AppHeader';
import { VoiceConversationView } from '@/components/assistant/VoiceConversationView';
import { VoiceMicControl } from '@/components/assistant/VoiceMicControl';
import { PressableScale } from '@/components/motion/PressableScale';
import { useVoiceSession } from '@/features/voice-assistant/VoiceSessionProvider';
import { spacing, radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function AssistantScreen() {
  const { colors } = useTheme();
  const { resumeSessionId } = useLocalSearchParams<{ resumeSessionId?: string }>();
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);

  const {
    phase,
    isActive,
    messages,
    visibleText,
    isStreaming,
    isGenerating,
    error,
    startSession,
    resumeSession,
    stopSession,
  } = useVoiceSession();

  const canResume =
    typeof resumeSessionId === 'string' &&
    resumeSessionId.length > 0 &&
    !isActive;

  return (
    <Screen padded={false}>
      <AppHeader title={assistantDisplayName} />
      <View style={styles.body}>
        {isActive ? (
          <VoiceConversationView
            messages={messages}
            visibleText={visibleText}
            isStreaming={isStreaming}
            isGenerating={isGenerating}
            phase={phase}
          />
        ) : (
          <View style={styles.idleHint}>
            <Text variant="h2" style={{ textAlign: 'center' }}>
              {assistantDisplayName}
            </Text>
            <Text variant="body" muted style={{ textAlign: 'center', marginTop: spacing.sm }}>
              Talk to {assistantDisplayName} naturally — your conversation is saved as a Voice
              chat. On Android, replies appear in a semi-transparent overlay when the app is in
              the background.
            </Text>
            {canResume ? (
              <PressableScale
                onPress={() => void resumeSession(resumeSessionId)}
                style={styles.resumeWrap}>
                <View style={[styles.resumeBtn, { backgroundColor: colors.primary }]}>
                  <Text variant="body" style={{ color: colors.onPrimary }}>
                    Continue voice chat
                  </Text>
                </View>
              </PressableScale>
            ) : null}
          </View>
        )}
        <VoiceMicControl
          phase={phase}
          statusMessage={error}
          onStart={() => void startSession()}
          onStop={() => void stopSession()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  idleHint: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  resumeWrap: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
  resumeBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
});
