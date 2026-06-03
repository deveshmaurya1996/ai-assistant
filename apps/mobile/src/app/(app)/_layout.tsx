import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/components/layout/DrawerContent';
import { useTheme } from '@/theme/ThemeProvider';
import { promptOverlayPermissionIfNeeded } from '@/lib/overlay-prompt';
import { ChatImagePreviewHost } from '@/features/chat/ChatImagePreviewHost';
import { VoiceSessionHost } from '@/features/voice-assistant/VoiceSessionHost';
import { ActionConfirmSheet } from '@/components/integrations/ActionConfirmSheet';
import { useChatActionConfirmBridge } from '@/features/chat/chatActionConfirmBridge';
import { useAuthStore } from '@/stores/auth';
import { Routes } from '@/lib/routes';

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
          drawerStyle: { backgroundColor: colors.background, width: 320 },
          overlayColor: colors.overlay,
          drawerContentContainerStyle: { flex: 1 },
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
  const { colors } = useTheme();
  const { session, loading, hydrate } = useAuthStore();
  const overlayPrompted = useRef(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (Platform.OS !== 'android' || overlayPrompted.current) return;
    overlayPrompted.current = true;
    const timer = setTimeout(() => {
      void promptOverlayPermissionIfNeeded();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
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
