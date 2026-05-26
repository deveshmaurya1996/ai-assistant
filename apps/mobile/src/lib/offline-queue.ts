import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@ai-assistant/offline-queue';
const MEMORY_CACHE_KEY = '@ai-assistant/memory-cache';

export interface QueuedAction {
  id: string;
  type: 'tool_execute' | 'reminder_create';
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function getOfflineQueue(): Promise<QueuedAction[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedAction[];
  } catch {
    return [];
  }
}

export async function enqueueOfflineAction(
  action: Omit<QueuedAction, 'id' | 'createdAt'>
): Promise<void> {
  const queue = await getOfflineQueue();
  queue.push({
    ...action,
    id: `q_${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function flushOfflineQueue(
  executor: (action: QueuedAction) => Promise<boolean>
): Promise<number> {
  const queue = await getOfflineQueue();
  const remaining: QueuedAction[] = [];
  let flushed = 0;

  for (const action of queue) {
    const ok = await executor(action);
    if (ok) flushed += 1;
    else remaining.push(action);
  }

  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return flushed;
}

export async function cacheMemorySnippet(userId: string, snippet: string): Promise<void> {
  const key = `${MEMORY_CACHE_KEY}:${userId}`;
  const raw = await AsyncStorage.getItem(key);
  const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
  list.unshift(snippet.slice(0, 500));
  await AsyncStorage.setItem(key, JSON.stringify(list.slice(0, 20)));
}

export async function getCachedMemory(userId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(`${MEMORY_CACHE_KEY}:${userId}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}
