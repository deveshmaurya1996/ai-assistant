import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { AudioLines, Pencil } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/motion/PressableScale';
import { spacing, radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { assistantRoute } from '@/lib/routes';
import { useVoiceSession } from '@/features/voice-assistant/VoiceSessionProvider';
import { useVoiceSessionBridge } from '@/features/voice-assistant/voiceSessionBridge';

type Props = {
  sessionId: string;
  composerOpen: boolean;
  onToggleComposer: () => void;
};

export function VoiceSessionFooter({
  sessionId,
  composerOpen,
  onToggleComposer,
}: Props) {
  const { colors } = useTheme();
  const { resumeSession } = useVoiceSession();
  const isActive = useVoiceSessionBridge((s) => s.isActive);
  const liveSessionId = useVoiceSessionBridge((s) => s.chatSessionId);

  const isLiveOnThisSession = isActive && liveSessionId === sessionId;

  const handleContinue = () => {
    if (isLiveOnThisSession) {
      router.push(assistantRoute());
      return;
    }

    void (async () => {
      await resumeSession(sessionId);
      router.push(assistantRoute());
    })();
  };

  const continueLabel = isLiveOnThisSession
    ? 'Return to voice'
    : 'Continue conversation';

  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <PressableScale onPress={handleContinue} style={styles.continueWrap}>
        <View style={[styles.continueBtn, { backgroundColor: colors.primary }]}>
          <AudioLines color={colors.onPrimary} size={20} />
          <Text variant="bodyMedium" style={{ color: colors.onPrimary, flex: 1 }} numberOfLines={1}>
            {continueLabel}
          </Text>
        </View>
      </PressableScale>

      <PressableScale
        onPress={onToggleComposer}
        accessibilityLabel={composerOpen ? 'Hide message input' : 'Type a message'}
        accessibilityState={{ expanded: composerOpen }}
      >
        <View
          style={[
            styles.penBtn,
            {
              backgroundColor: composerOpen ? colors.primaryMuted : colors.surfaceElevated,
              borderColor: composerOpen ? colors.primary : colors.border,
            },
          ]}
        >
          <Pencil color={colors.primary} size={20} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  continueWrap: {
    flex: 1,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  penBtn: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
