import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { FadeIn } from '@/components/motion/FadeIn';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { useVoice } from '@/context/VoiceContext';
import { useSettingsStore } from '@/stores/settings';
import { apiClient } from '@/lib/api';

export default function AssistantScreen() {
  const { colors } = useTheme();
  const { openVoiceSheet } = useVoice();
  const lastTranscript = useSettingsStore((s) => s.lastTranscript);
  const setLastTranscript = useSettingsStore((s) => s.setLastTranscript);
  const autoSend = useSettingsStore((s) => s.autoSendAfterTranscribe);

  const handleVoice = () => {
    openVoiceSheet({
      onTranscript: async (text) => {
        await setLastTranscript(text);
        if (autoSend) {
          const session = await apiClient.createSession(text.slice(0, 40));
          router.push(`/(app)/chat/${session.id}`);
        }
      },
    });
  };

  return (
    <Screen scroll>
      <AppHeader title="Assistant" />
      <View style={styles.body}>
        <FadeIn>
          <PressableScale onPress={handleVoice}>
            <View style={[styles.micHero, { backgroundColor: colors.primary }]}>
              <Mic color={colors.onPrimary} size={56} />
            </View>
          </PressableScale>
        </FadeIn>
        <Text variant="h2" style={{ textAlign: 'center', marginTop: spacing.lg }}>
          Tap to speak
        </Text>
        <Text variant="body" muted style={{ textAlign: 'center', marginTop: spacing.sm }}>
          Works in-app and in the background on Android
        </Text>

        {lastTranscript ? (
          <Card style={{ marginTop: spacing.xl }}>
            <Text variant="label" muted>
              LAST TRANSCRIPT
            </Text>
            <Text variant="body" style={{ marginTop: spacing.sm }}>
              {lastTranscript}
            </Text>
            <Button
              label="Continue in chat"
              variant="secondary"
              style={{ marginTop: spacing.md }}
              onPress={async () => {
                const session = await apiClient.createSession('Voice chat');
                router.push(`/(app)/chat/${session.id}`);
              }}
            />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  micHero: {
    width: 120,
    height: 120,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
