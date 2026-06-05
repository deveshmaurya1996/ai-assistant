import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/components/layout/DrawerContent';
import { useTheme } from '@/theme/ThemeProvider';
import { useThemedScreenOptions } from '@/theme/useThemedScreenOptions';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';
import { ChatImagePreviewHost } from '@/features/chat/ChatImagePreviewHost';
import { VoiceSessionHost } from '@/features/voice-assistant/VoiceSessionHost';
import { ActionConfirmSheet } from '@/components/integrations/ActionConfirmSheet';
import { useChatActionConfirmBridge } from '@/features/chat/chatActionConfirmBridge';
import { useAuthStore } from '@/stores/auth';
import { AppSplash } from '@/components/boot/AppSplash';
import { Routes } from '@/lib/routes';

function AppDrawerLayoutContent() {
  const { colors } = useTheme();
  const screenOptions = useThemedScreenOptions();
  const pendingAction = useChatActionConfirmBridge((s) => s.pendingAction);
  const confirmPendingAction = useChatActionConfirmBridge((s) => s.confirmPendingAction);
  const cancelPendingAction = useChatActionConfirmBridge((s) => s.cancelPendingAction);

  const showModalConfirm =
    Boolean(pendingAction) && !pendingAction?.tool.startsWith('whatsapp.');

  return (
    <>
      <ActionConfirmSheet
        visible={showModalConfirm}
        payload={pendingAction}
        onConfirm={() => confirmPendingAction()}
        onCancel={() => cancelPendingAction()}
      />
      <Drawer
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          ...screenOptions,
          drawerType: 'front',
          drawerStyle: { backgroundColor: colors.background, width: 320 },
          overlayColor: colors.overlay,
          drawerContentContainerStyle: { flex: 1, backgroundColor: colors.background },
          swipeEnabled: true,
          swipeEdgeWidth: 56,
        }}>
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
          name="settings"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="integrations"
          options={{
            drawerItemStyle: { display: 'none' },
            swipeEnabled: false,
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
            swipeEnabled: false,
          }}
        />
        <Drawer.Screen
          name="memory"
          options={{
            drawerItemStyle: { display: 'none' },
            swipeEnabled: false,
          }}
        />
      </Drawer>
    </>
  );
}

export default function AppDrawerLayout() {
  const { session, loading } = useAuthStore();
  const overlayPrompted = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || overlayPrompted.current) return;
    overlayPrompted.current = true;
    const timer = setTimeout(() => {
      void promptOverlayPermissionIfNeeded();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return <AppSplash />;
  }

  if (!session) {
    return <Redirect href={Routes.welcome} />;
  }

  return (
    <ChatImagePreviewHost>
      <VoiceSessionHost>
        <AppDrawerLayoutContent />
      </VoiceSessionHost>
    </ChatImagePreviewHost>
  );
}
