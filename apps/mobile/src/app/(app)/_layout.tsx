import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/components/layout/DrawerContent';
import { useTheme } from '@/theme/ThemeProvider';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';

export default function AppDrawerLayout() {
  const { colors } = useTheme();
  const overlayPrompted = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || overlayPrompted.current) return;
    overlayPrompted.current = true;
    const timer = setTimeout(() => {
      void promptOverlayPermissionIfNeeded();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Drawer
      drawerContent={() => <DrawerContent />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { backgroundColor: colors.surface, width: 300 },
        overlayColor: colors.overlay,
      }}>
      <Drawer.Screen name="(main)" options={{ title: 'Main' }} />
      <Drawer.Screen
        name="chat/[id]"
        options={{
          drawerItemStyle: { display: 'none' },
          swipeEnabled: false,
        }}
      />
    </Drawer>
  );
}
