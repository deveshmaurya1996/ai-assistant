import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import type { InboxDigestPushData } from '@ai-assistant/types';
import { useAuthStore } from '@/stores/auth';
import { fetchChatSidebarPage } from '@/features/chat/chatSidebarSync';
import { chatSessionRoute } from '@/lib/routes';

function isInboxDigestPushData(data: unknown): data is InboxDigestPushData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as InboxDigestPushData).type === 'inbox_digest'
  );
}

export function AutomationNotificationsHost() {
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!session) return;

    const refreshSidebar = () => {
      void fetchChatSidebarPage().catch(() => {});
    };

    const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (!isInboxDigestPushData(data)) return;
      refreshSidebar();
      if (data.sessionId) {
        router.push(chatSessionRoute(data.sessionId));
      }
    });

    const subReceived = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (isInboxDigestPushData(data)) {
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
