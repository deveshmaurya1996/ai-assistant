import { showReminderOverlay } from '@/lib/overlay';

export type ReminderNotificationPayload = {
  type?: string;
  reminderId?: string;
  title?: string;
  body?: string;
  displayTitle?: string;
  userPrompt?: string;
  missed?: boolean;
  showOverlay?: boolean;
};

const handledReminderIds = new Set<string>();

export function shouldHandleReminderOverlay(reminderId?: string): boolean {
  if (!reminderId) return true;
  if (handledReminderIds.has(reminderId)) return false;
  handledReminderIds.add(reminderId);
  return true;
}

export function resolveReminderOverlayFields(
  data: ReminderNotificationPayload,
  notificationContent?: { title?: string | null; body?: string | null }
): { displayTitle: string; userPrompt: string } {
  const displayTitle =
    data.displayTitle?.trim() ||
    data.title?.replace(/^Reminder:\s*"/, '').replace(/"$/, '').trim() ||
    notificationContent?.title
      ?.replace(/^Reminder:\s*"/, '')
      .replace(/"$/, '')
      .trim() ||
    'Reminder';

  const userPrompt =
    data.userPrompt?.trim() ||
    data.body?.trim() ||
    notificationContent?.body?.trim() ||
    displayTitle;

  return { displayTitle, userPrompt };
}

export async function showReminderOverlayFromPayload(
  data: ReminderNotificationPayload,
  notificationContent?: { title?: string | null; body?: string | null }
): Promise<void> {
  if (!shouldHandleReminderOverlay(data.reminderId)) return;
  const { displayTitle, userPrompt } = resolveReminderOverlayFields(
    data,
    notificationContent
  );
  await showReminderOverlay(displayTitle, userPrompt);
}
