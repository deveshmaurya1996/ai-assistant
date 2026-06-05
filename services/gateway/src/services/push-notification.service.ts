import { prisma } from '@ai-assistant/database';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PushPayload = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function sendPushToUser(input: PushPayload): Promise<void> {
  const tokens = await prisma.devicePushToken.findMany({
    where: { userId: input.userId },
  });
  if (tokens.length === 0) return;

  const messages = tokens.map((t) => {
    const prefs = (t.prefs ?? {}) as { reminderOverlayEnabled?: boolean };
    return {
      to: t.token,
      title: input.title,
      body: input.body,
      sound: 'default',
      priority: 'high' as const,
      channelId: 'reminders',
      data: {
        ...input.data,
        showOverlay:
          t.platform === 'android' && prefs.reminderOverlayEnabled === true,
      },
    };
  });

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.warn('[push] Expo push failed:', await res.text());
      return;
    }

    const result = (await res.json()) as {
      data?: Array<{ status: string; details?: { error?: string } }>;
    };
    const stale: string[] = [];
    result.data?.forEach((item, i) => {
      if (
        item.status === 'error' &&
        item.details?.error === 'DeviceNotRegistered' &&
        tokens[i]
      ) {
        stale.push(tokens[i].token);
      }
    });
    if (stale.length > 0) {
      await prisma.devicePushToken.deleteMany({ where: { token: { in: stale } } });
    }
  } catch (err) {
    console.warn('[push] send error:', err instanceof Error ? err.message : err);
  }
}
