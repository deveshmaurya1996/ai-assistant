import type { ComponentProps } from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

type Props = {
  providerId: string;
  size?: 'xs' | 'sm' | 'md';
};

type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const SIZES = {
  xs: { slot: 24, icon: 20 },
  sm: { slot: 36, icon: 28 },
  md: { slot: 44, icon: 36 },
} as const;

const PROVIDERS: Record<string, { name: MciName; color: string }> = {
  whatsapp: { name: 'whatsapp', color: '#25D366' },
  files: { name: 'folder-multiple', color: '#3B82F6' },
  notes: { name: 'note-text', color: '#F59E0B' },
};

const DEFAULT_PROVIDER = PROVIDERS.files;

export function ProviderIcon({ providerId, size = 'sm' }: Props) {
  const { slot, icon } = SIZES[size];

  return (
    <View style={[styles.slot, { width: slot, height: slot }]}>
      {providerId === 'google' ? (
        <GoogleColorIcon size={icon} />
      ) : (
        <MaterialCommunityIcons
          name={(PROVIDERS[providerId] ?? DEFAULT_PROVIDER).name}
          size={icon}
          color={(PROVIDERS[providerId] ?? DEFAULT_PROVIDER).color}
        />
      )}
    </View>
  );
}

function GoogleColorIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.059 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C33.64 6.053 28.991 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C33.64 6.053 28.991 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
