import { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Send } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/motion/PressableScale';
import { ChatVoiceMic } from '@/components/voice/ChatVoiceMic';
import { useChatDictation } from '@/features/voice/capture/useChatDictation';
import { spacing } from '@/theme/tokens';

type ChatComposerProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export function ChatComposer({ onSend, disabled }: ChatComposerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');

  const { error, isRecording, isProcessing, toggleRecording } = useChatDictation();

  const canSend = input.trim().length > 0 && !disabled && !isRecording && !isProcessing;

  const handleSend = () => {
    const text = input.trim();
    if (!text || disabled) return;
    setInput('');
    onSend(text);
  };

  const handleMicPress = useCallback(async () => {
    const text = await toggleRecording();
    if (text) {
      setInput(text.trim());
    }
  }, [toggleRecording]);

  return (
    <View
      style={[
        styles.container,
        {
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}>
      {error ? (
        <Text variant="caption" style={[styles.error, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}

      <View style={styles.inputRow}>
        <ChatVoiceMic
          isRecording={isRecording}
          isProcessing={isProcessing}
          disabled={disabled}
          onPress={() => void handleMicPress()}
        />
        <Input
          value={input}
          onChangeText={setInput}
          placeholder="Message…"
          multiline
          editable={!disabled && !isProcessing}
          style={styles.input}
        />
        <PressableScale onPress={handleSend} disabled={!canSend}>
          <View
            style={[
              styles.send,
              {
                backgroundColor: colors.primary,
                opacity: canSend ? 1 : 0.45,
              },
            ]}>
            <Send color={colors.onPrimary} size={20} />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  error: {
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  input: { flex: 1, maxHeight: 120 },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
