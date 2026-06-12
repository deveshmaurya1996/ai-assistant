import { aiClient } from '../lib/ai-client';

export function invalidateCognitiveManifestCache(userId: string): void {
  void aiClient.agent
    .invalidateManifest({ userId })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[manifest] cache invalidation failed for ${userId}: ${message}`);
    });
}
