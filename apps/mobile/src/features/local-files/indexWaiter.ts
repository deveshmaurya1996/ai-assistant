import { apiClient } from '@/lib/api-client';

const POLL_MS = 3000;
const MAX_WAIT_MS = 120_000;
const BULK_STATUS_BATCH = 50;

export async function waitUntilFilesReady(
  fileIds: string[]
): Promise<{ ready: string[]; failed: string[] }> {
  const unique = [...new Set(fileIds.filter(Boolean))];
  if (unique.length === 0) {
    return { ready: [], failed: [] };
  }

  const pending = new Set(unique);
  const ready: string[] = [];
  const failed: string[] = [];
  const deadline = Date.now() + MAX_WAIT_MS;

  while (pending.size > 0 && Date.now() < deadline) {
    const batch = [...pending].slice(0, BULK_STATUS_BATCH);
    const { items } = await apiClient.getFileBulkStatus(batch);

    for (const item of items) {
      if (item.status === 'ready') {
        pending.delete(item.id);
        ready.push(item.id);
      } else if (item.status === 'failed') {
        pending.delete(item.id);
        failed.push(item.id);
      }
    }

    if (pending.size > 0) {
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  for (const id of pending) {
    failed.push(id);
  }

  return { ready, failed };
}
