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
  if (tokens.length === 0) {
    console.warn(`[push] no device tokens for user ${input.userId}`);
    return;
  }

  const messages = tokens.map((t) => {
    const prefs = (t.prefs ?? {}) as { reminderOverlayEnabled?: boolean };
    const showOverlay =
      t.platform === 'android' && prefs.reminderOverlayEnabled === true;
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.data ?? {})) {
      if (value !== undefined && value !== null) {
        data[key] = String(value);
      }
    }
    data.showOverlay = showOverlay ? 'true' : 'false';
    return {
      to: t.token,
      title: input.title,
      body: input.body,
      sound: 'default',
      priority: 'high' as const,
      channelId: 'reminders',
      data,
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
      if (item.status !== 'error') return;
      const error = item.details?.error ?? 'unknown';
      console.warn(`[push] ticket error for token ${i}: ${error}`);
      if (error === 'DeviceNotRegistered' && tokens[i]) {
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
