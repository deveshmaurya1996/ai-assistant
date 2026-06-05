import { forwardRef, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetModal as BottomSheetModalType,
} from '@gorhom/bottom-sheet';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { dismissBottomSheet } from '@/lib/bottom-sheet';
import {
  useSettingsStore,
  formatGenderLabel,
  ASSISTANT_NAME_MAX_LENGTH,
} from '@/stores/settings';
import { canCustomizeAssistantDisplayName } from '@ai-assistant/types';

export const AssistantPickerSheet = forwardRef<BottomSheetModalType>(
  function AssistantPickerSheet(_, ref) {
    const { colors } = useTheme();
    const assistantDisplayName = useSettingsStore((s) => s.assistantDisplayName);
    const selectedPersonalityId = useSettingsStore((s) => s.selectedPersonalityId);
    const personalities = useSettingsStore((s) => s.personalities);
    const setAssistantDisplayName = useSettingsStore((s) => s.setAssistantDisplayName);
    const setSelectedPersonalityId = useSettingsStore((s) => s.setSelectedPersonalityId);

    const [nameDraft, setNameDraft] = useState(assistantDisplayName);
    const skipDismissCommitRef = useRef(false);

    useEffect(() => {
      setNameDraft(assistantDisplayName);
    }, [assistantDisplayName]);

    const canRenameAssistant = canCustomizeAssistantDisplayName(selectedPersonalityId);

    const commitName = () => {
      if (!canRenameAssistant) return;
      void setAssistantDisplayName(nameDraft);
    };

    const handleDismiss = () => {
      if (skipDismissCommitRef.current) {
        skipDismissCommitRef.current = false;
        return;
      }
      commitName();
    };

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['55%', '85%']}
        onDismiss={handleDismiss}
        backgroundStyle={{ backgroundColor: colors.surface }}>
        <BottomSheetScrollView contentContainerStyle={styles.list}>
          <Text variant="h2" style={{ marginBottom: spacing.md }}>
            Your assistant
          </Text>

          {canRenameAssistant ? (
            <>
              <Text variant="caption" muted>
                What should I call your assistant?
              </Text>
              <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
                Display name is how the assistant introduces itself in chat.
              </Text>
              <Input
                value={nameDraft}
                onChangeText={(t) => setNameDraft(t.slice(0, ASSISTANT_NAME_MAX_LENGTH))}
                onBlur={commitName}
                onSubmitEditing={commitName}
                placeholder="Assistant name"
                maxLength={ASSISTANT_NAME_MAX_LENGTH}
                style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}
              />
            </>
          ) : null}

          <Text variant="caption" muted style={{ marginBottom: spacing.sm }}>
            Personality
          </Text>
          {personalities.map((preset) => {
            const selected = selectedPersonalityId === preset.id;
            const subtitle = `${formatGenderLabel(preset.gender)} · ${preset.tagline}`;
            return (
              <Pressable
                key={preset.id}
                onPress={async () => {
                  skipDismissCommitRef.current = true;
                  setNameDraft(preset.name);
                  await setSelectedPersonalityId(preset.id);
                  dismissBottomSheet(ref);
                }}
                style={[styles.row, { borderBottomColor: colors.border }]}>
                <View style={styles.rowText}>
                  <Text variant="bodyMedium">{preset.name}</Text>
                  <Text variant="caption" muted>
                    {subtitle}
                  </Text>
                </View>
                {selected ? <Check color={colors.primary} size={20} /> : null}
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
});
