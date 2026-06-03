import { ArrowUp, Plus, Square } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Alert, View, StyleSheet, Platform, type TextInputKeyPressEvent } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { ChatAttachmentRef } from '@ai-assistant/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/motion/PressableScale';
import { VoiceMicButton } from '@/components/voice/VoiceMicButton';
import { handleComposerKeyPress } from '@/features/chat/handleComposerKeyPress';
import { useChatDictation } from '@/features/voice/capture/useChatDictation';
import { useChatAttachments } from '@/features/chat/useChatAttachments';
import { Routes } from '@/lib/routes';
import { useSettingsStore } from '@/stores/settings';
import { ChatAttachmentPickerSheet } from './ChatAttachmentPickerSheet';
import { AssistantIcon } from '@/components/assistant/AssistantIcon';
import { ChatAttachmentChips } from './ChatAttachmentChips';
import { ChatCameraModal } from './ChatCameraModal';
import { spacing, radii, typography } from '@/theme/tokens';

const INPUT_MIN_HEIGHT = 52;
const INPUT_MAX_HEIGHT = 148;

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
  const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
  const [input, setInput] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);

  const attachments = useChatAttachments();
  const { error, hint, isRecording, isProcessing, toggleRecording } =
    useChatDictation();

  const hasText = input.trim().length > 0;
  const hasAttachments = attachments.items.some(
    (i) => !i.error && (i.uploaded || i.uri)
  );
  const hasContent = hasText || hasAttachments;

  const canSend =
    hasContent &&
    !sendDisabled &&
    !isRecording &&
    !isProcessing &&
    !attachments.isUploading;

  const showSendSlot = hasContent || isGenerating;

  const attachmentWarn =
    attachments.items.length > 0 && input.trim().length > 500
      ? 'Short prompt + file works best — long pasted text slows replies.'
      : null;

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!hasContent || sendDisabled || attachments.isUploading) return;

    const maxQuery = 2000;
    if (attachments.items.length > 0 && text.length > maxQuery) {
      Alert.alert(
        'Message too long',
        `With a file attached, keep your message under ${maxQuery} characters.`
      );
      return;
    }

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

  const openAssistant = useCallback(() => {
    router.push(Routes.assistant);
  }, []);

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
          backgroundColor: colors.background,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}>
      {error ? (
        <Text variant="caption" style={[styles.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" style={[styles.caption, { color: colors.textMuted }]}>
          {hint}
        </Text>
      ) : attachmentWarn ? (
        <Text variant="caption" style={[styles.caption, { color: colors.textMuted }]}>
          {attachmentWarn}
        </Text>
      ) : null}

      <ChatAttachmentChips items={attachments.items} onRemove={attachments.removeItem} />

      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
              },
              android: { elevation: 2 },
              default: {},
            }),
          },
        ]}>
        <PressableScale onPress={openPicker} disabled={isGenerating}>
          <View style={[styles.inlineBtn, { opacity: isGenerating ? 0.45 : 1 }]}>
            <Plus color={colors.textMuted} size={22} />
          </View>
        </PressableScale>

        <Input
          value={input}
          onChangeText={setInput}
          placeholder="Ask anything…"
          multiline
          scrollEnabled
          blurOnSubmit={false}
          onFocus={onInputFocus}
          onKeyPress={handleKeyPress}
          editable={!isProcessing}
          textAlignVertical="top"
          style={[
            styles.input,
            typography.body,
            {
              backgroundColor: 'transparent',
              borderWidth: 0,
              color: colors.text,
            },
          ]}
        />

        {showSendSlot ? (
          isGenerating ? (
            <PressableScale onPress={onStop} disabled={!onStop}>
              <View
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: colors.danger,
                    opacity: onStop ? 1 : 0.45,
                  },
                ]}>
                <Square color={colors.onPrimary} size={16} fill={colors.onPrimary} />
              </View>
            </PressableScale>
          ) : (
            <PressableScale onPress={() => void handleSend()} disabled={!canSend}>
              <View
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: canSend ? 1 : 0.45,
                  },
                ]}>
                <ArrowUp color={colors.onPrimary} size={20} />
              </View>
            </PressableScale>
          )
        ) : (
          <View style={styles.emptyActions}>
            <VoiceMicButton
              isRecording={isRecording}
              isProcessing={isProcessing}
              disabled={isProcessing || isGenerating}
              onPress={() => void handleMicPress()}
              size={36}
              variant="composer"
            />
            <PressableScale
              onPress={openAssistant}
              disabled={isGenerating}
              accessibilityLabel={`Open ${assistantDisplayName}`}
              accessibilityRole="button">
              <View
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: colors.primaryMuted,
                    opacity: isGenerating ? 0.45 : 1,
                  },
                ]}>
                <AssistantIcon size={18} />
              </View>
            </PressableScale>
          </View>
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
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  caption: {
    textAlign: 'center',
    paddingBottom: spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 60,
    gap: spacing.xs,
  },
  inlineBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  input: {
    flex: 1,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginVertical: 0,
  },
  emptyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
