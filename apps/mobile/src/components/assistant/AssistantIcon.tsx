import { View, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';

/** Shared violet for assistant affordances across drawer, composer, and voice UI. */
export const ASSISTANT_ICON_COLOR = '#8B5CF6';

const DRAWER_SLOT = 28;

type AssistantIconProps = {
  size?: number;
  color?: string;
  /** Centers the icon in a fixed slot (drawer nav rows). */
  drawer?: boolean;
};

export function AssistantIcon({
  size = 20,
  color = ASSISTANT_ICON_COLOR,
  drawer = false,
}: AssistantIconProps) {
  const icon = <Sparkles color={color} size={size} strokeWidth={2} />;

  if (!drawer) return icon;

  return (
    <View style={[styles.drawerSlot, { width: DRAWER_SLOT, height: DRAWER_SLOT }]}>
      {icon}
    </View>
  );
}

const styles = StyleSheet.create({
  drawerSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
