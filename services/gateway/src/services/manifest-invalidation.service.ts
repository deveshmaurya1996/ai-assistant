import { orchestratorFetch } from '../lib/runtime-clients';
import { internalAuthHeaders } from '../plugins/internal-auth';

export function invalidateCognitiveManifestCache(userId: string): void {
  void orchestratorFetch('/internal/integrations/manifest/invalidate', {
    method: 'POST',
    headers: internalAuthHeaders(),
    body: JSON.stringify({ userId }),
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[manifest] cache invalidation failed for ${userId}: ${message}`);
  });
}
