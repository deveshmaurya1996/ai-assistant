import { useCallback, useRef, useState } from 'react';
import { Alert, View, StyleSheet, type TextInputKeyPressEvent } from 'react-native';
import { Plus, Send, Square } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { ChatAttachmentRef } from '@ai-assistant/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/motion/PressableScale';
import { ChatVoiceMic } from '@/components/voice/ChatVoiceMic';
import { handleComposerKeyPress } from '@/features/chat/handleComposerKeyPress';
import { useChatDictation } from '@/features/voice/capture/useChatDictation';
import { useChatAttachments } from '@/features/chat/useChatAttachments';
import { ChatAttachmentPickerSheet } from './ChatAttachmentPickerSheet';
import { ChatAttachmentChips } from './ChatAttachmentChips';
import { ChatCameraModal } from './ChatCameraModal';
import { spacing } from '@/theme/tokens';

export type ChatSendPayload = {
  text: string;
  attachments: ChatAttachmentRef[];
};

type ChatComposerProps = {
  onSend: (payload: ChatSendPayload) => void | boolean | Promise<boolean>;
  sendDisabled?: boolean;
  isGenerating?: boolean;
  onStop?: () => void;
  onInputFocus?: () => void;
};

export function ChatComposer({
  onSend,
  sendDisabled = false,
  isGenerating = false,
  onStop,
  onInputFocus,
}: ChatComposerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);

  const attachments = useChatAttachments();
  const { error, hint, isRecording, isProcessing, toggleRecording } =
    useChatDictation();

  const hasContent =
    input.trim().length > 0 ||
    attachments.items.some((i) => !i.error && (i.uploaded || i.uri));

  const canSend =
    hasContent &&
    !sendDisabled &&
    !isRecording &&
    !isProcessing &&
    !attachments.isUploading;

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!hasContent || sendDisabled || attachments.isUploading) return;

    try {
      const uploaded = await attachments.uploadAll();
      const ready = uploaded.filter(Boolean);
      const hasUploadError = attachments.items.some((i) => i.error);
      if (hasUploadError && ready.length === 0 && !text) return;

      const ok = await onSend({ text, attachments: ready });
      if (ok !== false) {
        setInput('');
        attachments.clearAll();
      }
    } catch (err) {
      Alert.alert(
        'Upload failed',
        err instanceof Error ? err.message : 'Could not upload attachments'
      );
    }
  }, [attachments, hasContent, input, onSend, sendDisabled]);

  const handleKeyPress = useCallback(
    (e: TextInputKeyPressEvent) => {
      handleComposerKeyPress(e, () => void handleSend(), canSend);
    },
    [handleSend, canSend]
  );

  const handleMicPress = useCallback(async () => {
    const result = await toggleRecording();
    if (result.kind === 'text') {
      setInput(result.text);
    }
  }, [toggleRecording]);

  const openPicker = useCallback(() => {
    if (!attachments.canAddMore && !attachments.hasImage) {
      Alert.alert('Limit reached', 'You can attach up to 4 files per message.');
      return;
    }
    sheetRef.current?.present();
  }, [attachments.canAddMore, attachments.hasImage]);

  const runPickerAction = useCallback(
    async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err) {
        Alert.alert(
          'Could not open picker',
          err instanceof Error ? err.message : 'Permission denied'
        );
      }
    },
    []
  );

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
      ) : hint ? (
        <Text variant="caption" style={[styles.error, { color: colors.textMuted }]}>
          {hint}
        </Text>
      ) : null}

      <ChatAttachmentChips items={attachments.items} onRemove={attachments.removeItem} />

      <View style={styles.inputRow}>
        <PressableScale onPress={openPicker} disabled={isGenerating}>
          <View
            style={[
              styles.plus,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                opacity: isGenerating ? 0.45 : 1,
              },
            ]}>
            <Plus color={colors.text} size={22} />
          </View>
        </PressableScale>

        <ChatVoiceMic
          isRecording={isRecording}
          isProcessing={isProcessing}
          disabled={isProcessing}
          onPress={() => void handleMicPress()}
        />

        <Input
          value={input}
          onChangeText={setInput}
          placeholder="Message…"
          multiline
          blurOnSubmit={false}
          onFocus={onInputFocus}
          onKeyPress={handleKeyPress}
          editable={!isProcessing}
          style={styles.input}
        />

        {isGenerating ? (
          <PressableScale onPress={onStop} disabled={!onStop}>
            <View
              style={[
                styles.send,
                {
                  backgroundColor: colors.danger,
                  opacity: onStop ? 1 : 0.45,
                },
              ]}>
              <Square color={colors.onPrimary} size={18} fill={colors.onPrimary} />
            </View>
          </PressableScale>
        ) : (
          <PressableScale onPress={() => void handleSend()} disabled={!canSend}>
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
        )}
      </View>

      <ChatAttachmentPickerSheet
        ref={sheetRef}
        onCamera={() => setCameraOpen(true)}
        onPhotos={() => runPickerAction(attachments.pickGallery)}
        onFiles={() => runPickerAction(attachments.pickFiles)}
      />

      <ChatCameraModal
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(capture) => {
          attachments.addCameraPhoto(capture);
          setCameraOpen(false);
        }}
      />
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
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
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
