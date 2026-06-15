import { forwardRef, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { AppBottomSheetModal, dismissBottomSheet, type BottomSheetModalType } from '@/lib/bottom-sheet';
import { useSettingsStore } from '@/stores/settings';
import { ModelHealthBadge } from '@/components/settings/ModelHealthBadge';
import {
  PickerIcon,
  autoRoutingIcon,
  resolveModelIcon,
} from '@ai-assistant/icons';
import type { ModelInfo } from '@ai-assistant/types';

function modelSubtitle(model: ModelInfo): string {
  const parts: string[] = [];
  if (model.priority != null) parts.push(`#${model.priority}`);
  if (model.rankScore != null) parts.push(`score ${model.rankScore.toFixed(2)}`);
  if (model.p95Latency1h != null) parts.push(`${Math.round(model.p95Latency1h)}ms p95`);
  return (parts.join(' · ') || model.provider) ?? '';
}

export const ModelPickerSheet = forwardRef<BottomSheetModalType>(function ModelPickerSheet(_, ref) {
  const { colors } = useTheme();
  const models = useSettingsStore((s) => s.modelsCatalog);
  const preferredModelId = useSettingsStore((s) => s.preferredModelId);
  const modelsLoading = useSettingsStore((s) => s.modelsLoading);
  const loadModels = useSettingsStore((s) => s.loadModels);
  const setPreferredModelId = useSettingsStore((s) => s.setPreferredModelId);
  const [savingId, setSavingId] = useState<string | null | undefined>(undefined);

  const handleOpen = useCallback(() => {
    void loadModels();
  }, [loadModels]);

  const selectModel = async (modelId: string | null) => {
    setSavingId(modelId);
    try {
      await setPreferredModelId(modelId);
      dismissBottomSheet(ref);
    } finally {
      setSavingId(undefined);
    }
  };

  const autoSelected = preferredModelId == null;
  const sorted = [...(models ?? [])].sort(
    (a, b) => (a.priority ?? 999) - (b.priority ?? 999)
  );

  return (
    <AppBottomSheetModal
      ref={ref}
      snapPoints={['60%', '90%']}
      onChange={(index) => {
        if (index >= 0) handleOpen();
      }}
      backgroundStyle={{ backgroundColor: colors.surface }}>
      <BottomSheetScrollView contentContainerStyle={styles.list}>
        <Text variant="h2" style={{ marginBottom: spacing.xs }}>
          AI model
        </Text>
        <Text variant="caption" muted style={{ marginBottom: spacing.lg }}>
          Auto picks the best available model from live health. Choose a specific model to always
          use it when available.
        </Text>

        <Pressable
          onPress={() => void selectModel(null)}
          disabled={savingId !== undefined}
          style={[styles.row, { borderBottomColor: colors.border }]}>
          <PickerIcon
            spec={{ ...autoRoutingIcon(), color: colors.primary }}
          />
          <View style={styles.rowText}>
            <View style={styles.titleRow}>
              <Text variant="bodyMedium">Automatic</Text>
            </View>
            <Text variant="caption" muted>
              Ranked by success, latency, and uptime
            </Text>
          </View>
          {savingId === null ? (
            <ActivityIndicator color={colors.primary} size={20} />
          ) : autoSelected ? (
            <Check color={colors.primary} size={20} />
          ) : null}
        </Pressable>

        {modelsLoading && !models?.length ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
        ) : null}

        {sorted.map((model) => {
          const selected = preferredModelId === model.id;
          const saving = savingId === model.id;
          return (
            <Pressable
              key={model.id}
              onPress={() => void selectModel(model.id)}
              disabled={savingId !== undefined || !model.configured}
              style={[
                styles.row,
                { borderBottomColor: colors.border, opacity: model.configured ? 1 : 0.5 },
              ]}>
              <PickerIcon spec={resolveModelIcon(model.id)} />
              <View style={styles.rowText}>
                <View style={styles.titleRow}>
                  <Text variant="bodyMedium">{model.label}</Text>
                  {model.recommended && autoSelected ? (
                    <Text variant="caption" style={{ color: colors.primary }}>
                      Recommended
                    </Text>
                  ) : null}
                </View>
                <Text variant="caption" muted>
                  {modelSubtitle(model)}
                </Text>
                <View style={styles.badgeRow}>
                  <ModelHealthBadge state={model.state} available={model.available} />
                </View>
              </View>
              {saving ? (
                <ActivityIndicator color={colors.primary} size={20} />
              ) : selected ? (
                <Check color={colors.primary} size={20} />
              ) : null}
            </Pressable>
          );
        })}
      </BottomSheetScrollView>
    </AppBottomSheetModal>
  );
});

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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  badgeRow: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
});
