import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/components/layout/DrawerContent';
import { useTheme } from '@/theme/ThemeProvider';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';
import { VoiceSessionHost } from '@/features/voice-assistant/VoiceSessionHost';
import { ActionConfirmSheet } from '@/components/integrations/ActionConfirmSheet';
import { useChatActionConfirmBridge } from '@/features/chat/chatActionConfirmBridge';

function AppDrawerLayoutContent() {
  const { colors } = useTheme();
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
        <Drawer.Screen
          name="chat/compose"
          options={{
            drawerItemStyle: { display: 'none' },
            swipeEnabled: false,
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
      </Drawer>
    </>
  );
}

export default function AppDrawerLayout() {
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
    <VoiceSessionHost>
      <AppDrawerLayoutContent />
    </VoiceSessionHost>
  );
}
