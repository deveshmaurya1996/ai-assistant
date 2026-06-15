import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchIconifySvg, normalizeIconId } from './iconify-api';

type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type IconifyIconProps = {
  icon: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  fallbackIcon?: MciName | string;
  fallbackColor?: string;
};

export function IconifyIcon({
  icon,
  size = 22,
  color,
  style,
  fallbackIcon,
  fallbackColor,
}: IconifyIconProps) {
  const [xml, setXml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const iconId = normalizeIconId(icon);

  useEffect(() => {
    if (!iconId) {
      setFailed(true);
      setXml(null);
      return;
    }

    let active = true;
    setFailed(false);
    setXml(null);

    void fetchIconifySvg(iconId, { size, color })
      .then((svg) => {
        if (active) setXml(svg);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [iconId, size, color]);

  if (!failed && xml) {
    return (
      <View style={style}>
        <SvgXml xml={xml} width={size} height={size} color={color} />
      </View>
    );
  }

  if (fallbackIcon || (!xml && !failed)) {
    return (
      <View style={style}>
        <MaterialCommunityIcons
          name={fallbackIcon as MciName}
          size={size}
          color={fallbackColor ?? color ?? '#64748B'}
        />
      </View>
    );
  }

  return <View style={[{ width: size, height: size }, style]} />;
}
