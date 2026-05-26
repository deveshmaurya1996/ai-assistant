import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/tokens';

type UserAvatarProps = {
  image?: string | null;
  name?: string;
  email?: string;
  size?: number;
};

export function UserAvatar({ image, name, email, size = 48 }: UserAvatarProps) {
  const { colors } = useTheme();
  const initial = name?.[0]?.toUpperCase() ?? email?.[0]?.toUpperCase() ?? '?';
  const imageUri = image?.trim();
  const hasImage = Boolean(imageUri);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radii.full,
          backgroundColor: colors.primaryMuted,
        },
      ]}>
      {hasImage ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: size, height: size, borderRadius: radii.full }}
          contentFit="cover"
          accessibilityLabel={name ? `${name} profile photo` : 'Profile photo'}
        />
      ) : (
        <Text variant="h2" style={{ color: colors.primary, fontSize: size * 0.4 }}>
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
