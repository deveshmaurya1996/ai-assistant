import { View, StyleSheet } from 'react-native';
import { IconifyIcon, resolveProviderIcon } from '@ai-assistant/icons';

type Props = {
  providerId: string;
  size?: 'xs' | 'sm' | 'md';
};

const SIZES = {
  xs: { slot: 24, icon: 20 },
  sm: { slot: 36, icon: 28 },
  md: { slot: 44, icon: 36 },
} as const;

export function ProviderIcon({ providerId, size = 'sm' }: Props) {
  const { slot, icon } = SIZES[size];
  const spec = resolveProviderIcon(providerId);

  return (
    <View style={[styles.slot, { width: slot, height: slot }]}>
      <IconifyIcon
        icon={spec.icon}
        size={icon}
        color={spec.color}
        fallbackIcon={spec.fallback}
        fallbackColor={spec.color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
