import { forwardRef, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetModal as BottomSheetModalType,
} from '@gorhom/bottom-sheet';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { getModels, type ModelsResponse } from '@/lib/api';
import { dismissBottomSheet } from '@/lib/bottom-sheet';
import { useSettingsStore } from '@/stores/settings';

export const ModelPickerSheet = forwardRef<BottomSheetModalType>(function ModelPickerSheet(
  _,
  ref
) {
  const { colors } = useTheme();
  const preferredModel = useSettingsStore((s) => s.preferredModel);
  const setPreferredModel = useSettingsStore((s) => s.setPreferredModel);
  const [models, setModels] = useState<ModelsResponse['models']>([]);

  useEffect(() => {
    getModels().then((data) => setModels(data.models));
  }, []);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['50%']}
      backgroundStyle={{ backgroundColor: colors.surface }}>
      <BottomSheetScrollView contentContainerStyle={styles.list}>
        <Text variant="h2" style={{ marginBottom: spacing.md }}>
          Preferred model
        </Text>
        {models.map((m) => {
          const selected = m.id === preferredModel;
          return (
            <Pressable
              key={m.id}
              onPress={async () => {
                await setPreferredModel(m.id);
                dismissBottomSheet(ref);
              }}
              style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text variant="bodyMedium" style={{ flex: 1 }}>
                {m.label}
              </Text>
              {selected ? <Check color={colors.primary} size={20} /> : null}
            </Pressable>
          );
        })}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  list: { padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
