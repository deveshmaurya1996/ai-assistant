import type { ComponentProps } from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type DrawerIconName =
  | 'newChat'
  | 'assistant'
  | 'settings'
  | 'overlay'
  | 'themeLight'
  | 'themeDark'
  | 'themeSystem'
  | 'connectApps'
  | 'automations'
  | 'notes';

type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type Props = {
  name: DrawerIconName;
  drawer?: boolean;
  iconSize?: number;
};

const DRAWER_ICON = 26;
const DRAWER_SLOT = 28;
const DEFAULT_ICON = 20;
const DEFAULT_SLOT = 28;

const ICONS: Record<DrawerIconName, { name: MciName; color: string }> = {
  newChat: { name: 'message-text', color: '#3B82F6' },
  assistant: { name: 'face-agent', color: '#8B5CF6' },
  settings: { name: 'cog', color: '#64748B' },
  overlay: { name: 'picture-in-picture-bottom-right', color: '#A855F7' },
  themeLight: { name: 'white-balance-sunny', color: '#F59E0B' },
  themeDark: { name: 'weather-night', color: '#6366F1' },
  themeSystem: { name: 'cellphone', color: '#475569' },
  connectApps: { name: 'apps', color: '#4285F4' },
  automations: { name: 'lightning-bolt', color: '#F97316' },
  notes: { name: 'notebook-outline', color: '#10B981' },
};

export function DrawerColorIcon({ name, drawer, iconSize }: Props) {
  const size = iconSize ?? (drawer ? DRAWER_ICON : DEFAULT_ICON);
  const slot = drawer ? DRAWER_SLOT : DEFAULT_SLOT;
  const icon = ICONS[name];

  return (
    <View style={[styles.slot, { width: slot, height: slot }]}>
      <MaterialCommunityIcons name={icon.name} size={size} color={icon.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
