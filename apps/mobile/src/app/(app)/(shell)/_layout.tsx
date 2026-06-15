import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/components/layout/DrawerContent';
import { DrawerCloseGesture } from '@/components/layout/DrawerCloseGesture';
import { useAppDrawerScreenOptions } from '@/components/layout/AppDrawerSwipeOptions';
import { ChatImagePreviewHost } from '@/features/chat/ChatImagePreviewHost';
import { VoiceSessionHost } from '@/features/voice-assistant/VoiceSessionHost';
import { useAuthStore } from '@/stores/auth';
import { AppSplash } from '@/components/boot/AppSplash';
import { Routes } from '@/lib/routes';
import { ActiveChatSessionTracker } from '@/features/chat/ActiveChatSessionTracker';

function ShellDrawerContent() {
  const drawerScreenOptions = useAppDrawerScreenOptions();

  return (
    <>
      <ActiveChatSessionTracker />
      <Drawer
        backBehavior="history"
        drawerContent={(props) => (
          <DrawerCloseGesture onClose={() => props.navigation.closeDrawer()}>
            <DrawerContent {...props} />
          </DrawerCloseGesture>
        )}
        screenOptions={drawerScreenOptions}>
        <Drawer.Screen
          name="chat/compose"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="chat/[id]"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="assistant"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="integrations"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="automations"
          options={{
            drawerItemStyle: { display: 'none' },
            swipeEnabled: false,
          }}
        />
        <Drawer.Screen
          name="notes"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
      </Drawer>
    </>
  );
}

export default function ShellLayout() {
  const { session, loading } = useAuthStore();

  if (loading) {
    return <AppSplash />;
  }

  if (!session) {
    return <Redirect href={Routes.welcome} />;
  }

  return (
    <ChatImagePreviewHost>
      <VoiceSessionHost>
        <ShellDrawerContent />
      </VoiceSessionHost>
    </ChatImagePreviewHost>
  );
}
