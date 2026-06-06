import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { Routes } from '@/lib/routes';
import { registerPushTokenIfNeeded } from './registerPushToken';
import { emitReminderRefresh } from './reminderEvents';
import { useChatSocket } from '@/features/chat/ChatSocketProvider';
import {
  registerReminderOverlayTask,
  REMINDER_OVERLAY_TASK,
} from './reminderOverlayTask';
import {
  showReminderOverlayFromPayload,
  type ReminderNotificationPayload,
} from './reminderNotificationUtils';

export function ReminderNotificationsHost() {
  const session = useAuthStore((s) => s.session);
  const reminderOverlayEnabled = useSettingsStore((s) => s.reminderOverlayEnabled);
  const { socket } = useChatSocket();

  useEffect(() => {
    if (!session) return;
    void registerPushTokenIfNeeded(reminderOverlayEnabled);
    void registerReminderOverlayTask().catch(() => {});
  }, [session, reminderOverlayEnabled]);

  useEffect(() => {
    if (!socket) return;

    const onNotification = (data: ReminderNotificationPayload) => {
      if (data.type !== 'reminder') return;

      emitReminderRefresh();

      if (reminderOverlayEnabled) {
        void showReminderOverlayFromPayload(data);
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
      const data = notification.request.content.data as ReminderNotificationPayload;
      if (data?.type !== 'reminder') return;
      emitReminderRefresh();
      if (data.showOverlay && reminderOverlayEnabled) {
        void showReminderOverlayFromPayload(data, notification.request.content);
      }
    });
    return () => sub.remove();
  }, [reminderOverlayEnabled]);

  return null;
}

export { REMINDER_OVERLAY_TASK };
