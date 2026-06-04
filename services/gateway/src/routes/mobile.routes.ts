import type { FastifyInstance } from 'fastify';
import { config } from '@ai-assistant/config';

function resolveUpdateUrl(): string | null {
  const mode = config.mobileUpdateUrlMode;
  const play = config.mobileAndroidPlayStoreUrl?.trim() || '';
  const apk = config.mobileAndroidApkUrl?.trim() || '';

  if (mode === 'play') return play || apk || null;
  if (mode === 'apk') return apk || play || null;
  return play || apk || null;
}

export async function mobileRoutes(fastify: FastifyInstance) {
  fastify.get('/version', async () => {
    const updateUrl = resolveUpdateUrl();
    return {
      latestVersion: config.mobileLatestVersion,
      minVersion: config.mobileMinVersion,
      minAndroidVersionCode: config.mobileMinAndroidVersionCode,
      forceUpdate: false,
      updateUrl,
      updateUrlMode: config.mobileUpdateUrlMode,
    };
  });
}
