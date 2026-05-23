import { Tabs } from 'expo-router';
import { FloatingDockTabBar } from '@/components/layout/FloatingDockTabBar';

export default function MainTabsLayout() {
  return (
    <Tabs
      tabBar={(props) => (
        <FloatingDockTabBar
          activeIndex={props.state.index}
          navigate={(name) => props.navigation.navigate(name)}
        />
      )}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistant' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
