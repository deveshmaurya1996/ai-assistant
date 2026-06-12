import { config } from '@ai-assistant/config';
import { correlationHeaders } from './request-context';
import { enqueueIngestionJob as enqueueIngestionJobDirect } from '../workers/ingestion.worker';

function withCorrelation(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...correlationHeaders(),
      ...init?.headers,
    },
  };
}

export async function toolRuntimeFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = config.toolRuntimeUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${base}${normalized}`, withCorrelation(init));
}

export async function capabilityRuntimeFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = config.capabilityRuntimeUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${base}${normalized}`, withCorrelation(init));
}

export function enqueueIngestionJob(
  path: string,
  body?: Record<string, unknown>,
  logLabel = 'ingestion'
): void {
  void (async () => {
    try {
      if (path.includes('/files/index') && body?.userId && body?.fileAssetId) {
        await enqueueIngestionJobDirect('index-file', {
          userId: body.userId,
          fileAssetId: body.fileAssetId,
        });
        return;
      }
      const match = path.match(/\/sync\/([^/]+)/);
      if (match?.[1]) {
        await enqueueIngestionJobDirect('sync', { connectionId: match[1] });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[${logLabel}] enqueue failed: ${message}`);
    }
  })();
}
