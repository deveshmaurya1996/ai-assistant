import type { FastifyBaseLogger } from 'fastify';
import { config } from '@ai-assistant/config';

const MAX_ATTEMPTS = 30;
const RETRY_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 2_000;

function intelligenceBaseUrl(): string {
  return config.intelligenceUpstreamUrl.replace(/\/$/, '');
}

export async function probeIntelligenceHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${intelligenceBaseUrl()}/health`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { service?: string; ai?: boolean };
    return body.service === 'intelligence' && body.ai === true;
  } catch {
    return false;
  }
}

export async function waitForIntelligence(
  maxAttempts = MAX_ATTEMPTS,
  intervalMs = RETRY_INTERVAL_MS
): Promise<void> {
  const base = intelligenceBaseUrl();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await probeIntelligenceHealth()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Intelligence runtime not ready at ${base} after ${maxAttempts} attempts`
  );
}

export function monitorIntelligenceReadiness(log: FastifyBaseLogger): void {
  void waitForIntelligence()
    .then(() => {
      log.info('Intelligence runtime ready');
    })
    .catch((err) => {
      log.warn(
        {
          err: err instanceof Error ? err.message : err,
        },
        'Intelligence runtime not ready; API is up but chat and voice may fail until it is'
      );
    });
}
