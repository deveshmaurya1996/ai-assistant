import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { Routes } from '@/lib/routes';
import { registerPushTokenIfNeeded } from './registerPushToken';
import { emitReminderRefresh } from './reminderEvents';
import { showReminderOverlay } from '@/lib/overlay';
import { useChatSocket } from '@/features/chat/ChatSocketProvider';

const handledReminderIds = new Set<string>();

export function ReminderNotificationsHost() {
  const session = useAuthStore((s) => s.session);
  const reminderOverlayEnabled = useSettingsStore((s) => s.reminderOverlayEnabled);
  const { socket } = useChatSocket();

  useEffect(() => {
    if (!session) return;
    void registerPushTokenIfNeeded(reminderOverlayEnabled);
  }, [session, reminderOverlayEnabled]);

  useEffect(() => {
    if (!socket) return;

    const onNotification = (data: {
      type?: string;
      reminderId?: string;
      title?: string;
      body?: string;
      missed?: boolean;
    }) => {
      if (data.type !== 'reminder') return;
      if (data.reminderId && handledReminderIds.has(data.reminderId)) return;
      if (data.reminderId) handledReminderIds.add(data.reminderId);

      emitReminderRefresh();

      if (reminderOverlayEnabled && data.title) {
        void showReminderOverlay(data.title, data.body ?? '');
      }
    };

    socket.on('notification:created', onNotification);
    return () => {
      socket.off('notification:created', onNotification);
    };
  }, [socket, reminderOverlayEnabled]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string };
      if (data?.type === 'reminder') {
        router.push(Routes.automationsReminders);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as {
        type?: string;
        reminderId?: string;
        showOverlay?: boolean;
      };
      if (data?.type !== 'reminder') return;
      emitReminderRefresh();
      if (data.showOverlay && reminderOverlayEnabled) {
        const { title, body } = notification.request.content;
        void showReminderOverlay(String(title ?? 'Reminder'), String(body ?? ''));
      }
    });
    return () => sub.remove();
  }, [reminderOverlayEnabled]);

  return null;
}
