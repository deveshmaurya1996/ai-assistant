import {
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
} from '@/lib/secure-storage';

const STORAGE_KEY = 'ai-assistant_pending_push_token';

export type PendingPushRegistration = {
  token: string;
  platform: 'ios' | 'android';
  prefs?: { reminderOverlayEnabled?: boolean };
  savedAt: string;
};

export async function savePendingPushRegistration(
  data: Omit<PendingPushRegistration, 'savedAt'>
): Promise<void> {
  const payload: PendingPushRegistration = {
    ...data,
    savedAt: new Date().toISOString(),
  };
  await setItemAsync(STORAGE_KEY, JSON.stringify(payload));
}

export async function getPendingPushRegistration(): Promise<PendingPushRegistration | null> {
  const raw = await getItemAsync(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingPushRegistration;
  } catch {
    return null;
  }
}

export async function clearPendingPushRegistration(): Promise<void> {
  await deleteItemAsync(STORAGE_KEY);
}
