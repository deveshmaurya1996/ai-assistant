type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeReminderRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitReminderRefresh(): void {
  listeners.forEach((l) => l());
}
