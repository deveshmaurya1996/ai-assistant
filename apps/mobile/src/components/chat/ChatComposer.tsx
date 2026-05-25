import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Mic, Send } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Input } from '@/components/ui/Input';
import { PressableScale } from '@/components/motion/PressableScale';
import { useVoice } from '@/context/VoiceContext';
import { spacing } from '@/theme/tokens';

type ChatComposerProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export function ChatComposer({ onSend, disabled }: ChatComposerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { openVoiceSheet } = useVoice();
  const [input, setInput] = useState('');

  const handleSend = () => {
    const text = input.trim();
    if (!text || disabled) return;
    setInput('');
    onSend(text);
  };

  return (
    <View
      style={[
        styles.inputRow,
        {
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}>
      <Pressable
        onPress={() =>
          openVoiceSheet({
            onTranscript: (text) => setInput(text.trim()),
          })
        }
        disabled={disabled}
        style={[styles.micBtn, { backgroundColor: colors.primaryMuted }]}>
        <Mic color={colors.primary} size={22} />
      </Pressable>
      <Input
        value={input}
        onChangeText={setInput}
        placeholder="Message…"
        multiline
        editable={!disabled}
        style={styles.input}
      />
      <PressableScale onPress={handleSend} disabled={disabled}>
        <View style={[styles.send, { backgroundColor: colors.primary }]}>
          <Send color={colors.onPrimary} size={20} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, maxHeight: 120 },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
