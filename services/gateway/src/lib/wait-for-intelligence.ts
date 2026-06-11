import { config } from '@ai-assistant/config';

export async function waitForIntelligence(
  maxAttempts = 30,
  intervalMs = 1000
): Promise<void> {
  const base = config.intelligenceUpstreamUrl.replace(/\/$/, '');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Intelligence runtime not ready at ${base} after ${maxAttempts} attempts`
  );
}
