import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AssistantIcon } from '@/components/assistant/AssistantIcon';
import { PressableScale } from '@/components/motion/PressableScale';
import { PulseRing } from '@/components/motion/PulseRing';
import { useTheme } from '@/theme/ThemeProvider';

const ORB_SIZE = 120;
const ICON_SIZE = 48;

type Props = {
  assistantName: string;
  onPress: () => void;
};

export function AssistantStartButton({ assistantName, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      <PulseRing color={colors.primary} size={ORB_SIZE} opacity={0.28} />
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Start voice conversation with ${assistantName}`}>
        <LinearGradient
          colors={[colors.primary, colors.primaryMuted]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}>
          <View style={[styles.inner, { backgroundColor: colors.surface }]}>
            <AssistantIcon size={ICON_SIZE} />
          </View>
        </LinearGradient>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    padding: 4,
    borderRadius: ORB_SIZE / 2,
  },
  inner: {
    width: ORB_SIZE - 8,
    height: ORB_SIZE - 8,
    borderRadius: (ORB_SIZE - 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
