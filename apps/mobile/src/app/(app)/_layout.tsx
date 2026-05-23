import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/components/layout/DrawerContent';
import { useTheme } from '@/theme/ThemeProvider';

export default function AppDrawerLayout() {
  const { colors } = useTheme();

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
