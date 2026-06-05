import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { fetchChatSidebarPage } from '@/features/chat/chatSidebarSync';
import { chatSessionRoute } from '@/lib/routes';

export function AutomationNotificationsHost() {
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!session) return;

    const refreshSidebar = () => {
      void fetchChatSidebarPage().catch(() => {});
    };

    const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        sessionId?: string;
      };
      if (data?.type !== 'inbox_digest') return;
      refreshSidebar();
      if (typeof data.sessionId === 'string' && data.sessionId) {
        router.push(chatSessionRoute(data.sessionId));
      }
    });

    const subReceived = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as { type?: string };
      if (data?.type === 'inbox_digest') {
        refreshSidebar();
      }
    });

    return () => {
      subResponse.remove();
      subReceived.remove();
    };
  }, [session]);

  return null;
}
