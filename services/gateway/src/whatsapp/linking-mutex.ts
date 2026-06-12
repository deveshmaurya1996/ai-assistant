const locks = new Map<string, Promise<void>>();

export async function runLinkingOp<T>(sessionId: string, op: () => Promise<T>): Promise<T> {
  const prev = locks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const job = prev.catch(() => undefined).then(() => gate);
  locks.set(sessionId, job);

  await prev.catch(() => undefined);
  try {
    return await op();
  } finally {
    release();
    if (locks.get(sessionId) === job) {
      locks.delete(sessionId);
    }
  }
}

export function isLinkingOpLocked(sessionId: string): boolean {
  return locks.has(sessionId);
}
