import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { PickerIcon } from '@ai-assistant/icons';
import { useAssistantIdentity } from '@/features/assistant/useAssistantIdentity';
import { radii } from '@/theme/tokens';

type Props = {
  personalityId?: string | null;
  size?: number;
  wrapSize?: number;
  style?: StyleProp<ViewStyle>;
};

export function PersonalityAvatar({
  personalityId,
  size = 16,
  wrapSize = 28,
  style,
}: Props) {
  const { iconSpec } = useAssistantIdentity(personalityId);

  return (
    <View style={[styles.slot, { width: wrapSize, height: wrapSize }, style]}>
      <PickerIcon
        spec={iconSpec}
        size={size}
        wrapStyle={[
          styles.wrap,
          {
            width: wrapSize,
            height: wrapSize,
            borderRadius: wrapSize / 2,
            marginRight: 0,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: {
    borderRadius: radii.full,
  },
});
