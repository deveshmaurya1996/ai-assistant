import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { showReminderOverlay } from '@/lib/overlay';

export const REMINDER_OVERLAY_TASK = 'REMINDER_OVERLAY_TASK';

type ReminderPushData = {
  type?: string;
  reminderId?: string;
  displayTitle?: string;
  userPrompt?: string;
  showOverlay?: boolean;
};

function parseReminderPushData(data: unknown): ReminderPushData | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as ReminderPushData;
  if (d.type !== 'reminder') return null;
  return d;
}

TaskManager.defineTask(REMINDER_OVERLAY_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[push] reminder overlay task error:', error.message);
    return;
  }

  const notification = data as Notifications.Notification | undefined;
  if (!notification) return;

  const pushData = parseReminderPushData(notification.request.content.data);
  if (!pushData?.showOverlay) return;

  const displayTitle =
    pushData.displayTitle?.trim() ||
    String(notification.request.content.title ?? 'Reminder').replace(
      /^Reminder:\s*"/,
      ''
    ).replace(/"$/, '') ||
    'Reminder';
  const userPrompt =
    pushData.userPrompt?.trim() ||
    String(notification.request.content.body ?? '');

  await showReminderOverlay(displayTitle, userPrompt);
});

export async function registerReminderOverlayTask(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(REMINDER_OVERLAY_TASK);
  if (!registered) {
    await Notifications.registerTaskAsync(REMINDER_OVERLAY_TASK);
  }
}
