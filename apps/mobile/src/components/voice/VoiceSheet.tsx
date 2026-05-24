import { forwardRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetModal as BottomSheetModalType,
} from '@gorhom/bottom-sheet';
import { Mic, Square } from 'lucide-react-native';
import { PulseRing } from '@/components/motion/PulseRing';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import { useVoiceRecorder } from '@/features/voice/useVoiceRecorder';
import { dismissBottomSheet } from '@/lib/bottom-sheet';
import { useSettingsStore } from '@/stores/settings';
import { PressableScale } from '@/components/motion/PressableScale';

type Props = {
  onTranscript?: (text: string) => void;
};

export const VoiceSheet = forwardRef<BottomSheetModalType, Props>(
  function VoiceSheet({ onTranscript }, ref) {
    const { colors } = useTheme();
    const { status, error, isRecording, startRecording, stopAndTranscribe, cancel } =
      useVoiceRecorder();
    const setLastTranscript = useSettingsStore((s) => s.setLastTranscript);
    const autoSend = useSettingsStore((s) => s.autoSendAfterTranscribe);

    const handleStop = useCallback(async () => {
      const text = await stopAndTranscribe();
      if (text) {
        await setLastTranscript(text);
        onTranscript?.(text);
        dismissBottomSheet(ref);
      }
    }, [stopAndTranscribe, setLastTranscript, onTranscript, ref]);

    const handleCancel = useCallback(async () => {
      await cancel();
      dismissBottomSheet(ref);
    }, [cancel, ref]);

    const label =
      status === 'processing'
        ? 'Processing…'
        : isRecording
          ? 'Listening… tap to finish'
          : status === 'error'
            ? error ?? 'Error'
            : 'Ready';

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['40%']}
        enablePanDownToClose
        onChange={(index) => {
          if (index >= 0) {
            void startRecording();
          }
        }}
        onDismiss={() => {
          void cancel();
        }}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}>
        <BottomSheetView style={styles.content}>
          <Text variant="h2" style={{ textAlign: 'center' }}>
            Voice input
          </Text>
          <Text variant="caption" muted style={{ textAlign: 'center', marginTop: spacing.xs }}>
            {autoSend ? 'Will send to chat when done' : 'Transcript fills your message'}
          </Text>

          <View style={styles.micArea}>
            {isRecording ? <PulseRing color={colors.primary} /> : null}
            <PressableScale
              onPress={isRecording ? handleStop : startRecording}
              disabled={status === 'processing'}>
              <View style={[styles.micCircle, { backgroundColor: colors.primary }]}>
                {isRecording ? (
                  <Square color={colors.onPrimary} size={32} fill={colors.onPrimary} />
                ) : (
                  <Mic color={colors.onPrimary} size={32} />
                )}
              </View>
            </PressableScale>
          </View>

          <Text variant="bodyMedium" style={{ textAlign: 'center' }}>
            {label}
          </Text>

          <View style={styles.actions}>
            <Button label="Cancel" variant="ghost" onPress={handleCancel} />
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  micArea: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  pulse: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  actions: { width: '100%', marginTop: spacing.sm },
});
