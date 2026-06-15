import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconifyIcon } from './Icon';
import type { IconSpec } from './resolvers';

export type PickerIconProps = {
  spec: IconSpec;
  size?: number;
  style?: StyleProp<ViewStyle>;
  wrapStyle?: StyleProp<ViewStyle>;
};

export function PickerIcon({ spec, size = 22, style, wrapStyle }: PickerIconProps) {
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: spec.pickerBackground ?? `${spec.color}18` },
        wrapStyle,
      ]}>
      <IconifyIcon
        icon={spec.icon}
        size={size}
        color={spec.color}
        style={style}
        fallbackIcon={spec.fallback}
        fallbackColor={spec.color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
});
