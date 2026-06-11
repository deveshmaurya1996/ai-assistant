import { config, getAiServiceUrl, getIntelligenceUrl } from '@ai-assistant/config';
import { injectTraceHeadersFromInit } from '@ai-assistant/telemetry';
import { internalAuthHeaders } from '../plugins/internal-auth';
import { AppError } from './errors';
import { correlationHeaders, getRequestId } from './request-context';

const TIMEOUTS = {
  health: 2_000,
  memorySearch: 10_000,
  agentTurn: 60_000,
  chatStream: 120_000,
  default: 30_000,
} as const;

type FetchInit = RequestInit & { timeoutMs?: number; requestId?: string };

function buildHeaders(init?: FetchInit): Record<string, string> {
  const headers = injectTraceHeadersFromInit(init);
  const correlation = correlationHeaders(init?.requestId ?? getRequestId());
  Object.assign(headers, correlation, internalAuthHeaders());
  if (!headers['Content-Type'] && !(init?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function intelligenceFetch(
  url: string,
  init?: FetchInit
): Promise<Response> {
  const { timeoutMs = TIMEOUTS.default, ...rest } = init ?? {};
  return fetch(url, {
    ...rest,
    headers: buildHeaders(rest),
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

async function parseJsonResponse<T>(res: Response, method: string, path: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      502,
      `Intelligence error (${res.status}) [${method} ${path}]`,
      body || res.statusText
    );
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res as unknown as T;
}

export const aiClient = {
  health: async () => {
    const res = await intelligenceFetch(getIntelligenceUrl('/health'), {
      timeoutMs: TIMEOUTS.health,
    });
    return res.json();
  },

  chat: {
    title: <T>(body: unknown, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/chat/title'), {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.default,
        ...init,
      }).then((res) => parseJsonResponse<T>(res, 'POST', '/v1/chat/title')),

    stream: (body: unknown, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/chat/stream'), {
        method: 'POST',
        headers: { Accept: 'text/event-stream', ...buildHeaders(init) },
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.chatStream,
        ...init,
      }),
  },

  memory: {
    ingest: <T>(body: unknown, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/memory/ingest'), {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.default,
        ...init,
      }).then((res) => parseJsonResponse<T>(res, 'POST', '/v1/memory/ingest')),

    search: <T>(query: string, params: Record<string, string>, init?: FetchInit) => {
      const qs = new URLSearchParams({ query, ...params }).toString();
      return intelligenceFetch(getIntelligenceUrl(`/v1/memory/search?${qs}`), {
        timeoutMs: TIMEOUTS.memorySearch,
        ...init,
      }).then((res) => parseJsonResponse<T>(res, 'GET', '/v1/memory/search'));
    },

    deletePoint: (pointId: string, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl(`/v1/memory/points/${encodeURIComponent(pointId)}`), {
        method: 'DELETE',
        timeoutMs: TIMEOUTS.default,
        ...init,
      }).then((res) => parseJsonResponse(res, 'DELETE', `/v1/memory/points/${pointId}`)),

    deleteSession: (chatSessionId: string, userId: string, init?: FetchInit) => {
      const qs = new URLSearchParams({ user_id: userId }).toString();
      return intelligenceFetch(
        getIntelligenceUrl(`/v1/memory/session/${encodeURIComponent(chatSessionId)}?${qs}`),
        { method: 'DELETE', timeoutMs: TIMEOUTS.default, ...init }
      ).then((res) => parseJsonResponse(res, 'DELETE', `/v1/memory/session/${chatSessionId}`));
    },
  },

  agent: {
    turn: (body: unknown, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/agent/turn'), {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.agentTurn,
        ...init,
      }),

    plan: (body: unknown, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/agent/plan'), {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.agentTurn,
        ...init,
      }),

    diagnostics: (userId: string, init?: FetchInit) =>
      intelligenceFetch(
        `${getIntelligenceUrl('/v1/agent/diagnostics')}?userId=${encodeURIComponent(userId)}`,
        { timeoutMs: TIMEOUTS.default, ...init }
      ),

    invalidateManifest: (body: unknown, init?: FetchInit) =>
      intelligenceFetch(`${config.gatewayUrl}/internal/integrations/manifest/invalidate`, {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.default,
        ...init,
      }),

    run: <T>(body: unknown, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/agents/run'), {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.default,
        ...init,
      }).then((res) => parseJsonResponse<T>(res, 'POST', '/v1/agents/run')),
  },

  voice: {
    transcribe: (formData: FormData, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/voice/transcribe'), {
        method: 'POST',
        body: formData,
        headers: correlationHeaders(init?.requestId ?? getRequestId()),
        timeoutMs: TIMEOUTS.default,
        ...init,
      }).then((res) => parseJsonResponse<{ text: string }>(res, 'POST', '/v1/voice/transcribe')),

    speak: (body: unknown, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/voice/speak'), {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.chatStream,
        ...init,
      }),

    mode: <T>(userId: string | undefined, init?: FetchInit) => {
      const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
      return intelligenceFetch(getIntelligenceUrl(`/v1/voice/mode${qs}`), {
        timeoutMs: TIMEOUTS.default,
        ...init,
      }).then((res) => parseJsonResponse<T>(res, 'GET', '/v1/voice/mode'));
    },

    liveToken: <T>(body: unknown, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/voice/live/token'), {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.default,
        ...init,
      }).then((res) => parseJsonResponse<T>(res, 'POST', '/v1/voice/live/token')),
  },

  kb: {
    search: <T>(query: string, params: Record<string, string>, init?: FetchInit) => {
      const qs = new URLSearchParams({ query, ...params }).toString();
      return intelligenceFetch(getIntelligenceUrl(`/v1/kb/search?${qs}`), {
        timeoutMs: TIMEOUTS.memorySearch,
        ...init,
      }).then((res) => parseJsonResponse<T>(res, 'GET', '/v1/kb/search'));
    },
  },

  providers: {
    health: (init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/providers/health'), {
        timeoutMs: TIMEOUTS.health,
        ...init,
      }),
  },

  models: (init?: FetchInit) =>
    intelligenceFetch(getIntelligenceUrl('/v1/models'), {
      timeoutMs: TIMEOUTS.default,
      ...init,
    }),

  image: {
    generate: (body: unknown, init?: FetchInit) =>
      intelligenceFetch(getIntelligenceUrl('/v1/image/generate'), {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: TIMEOUTS.chatStream,
        ...init,
      }),
  },

  fetch: intelligenceFetch,
  url: getAiServiceUrl,
};

export async function fetchAi<T>(path: string, init?: FetchInit): Promise<T> {
  const res = await intelligenceFetch(getAiServiceUrl(path), init);
  return parseJsonResponse<T>(res, init?.method ?? 'GET', path);
}
