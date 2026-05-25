import { FastifyInstance, FastifyRequest } from 'fastify';
import { auth } from '@ai-assistant/auth';

const MOBILE_AUTH_SCHEME = 'ai-assistant';
const SESSION_COOKIE = 'better-auth.session_token';
const DEFAULT_WEB_CALLBACK = 'http://localhost:8081/auth/callback';

function decodeReturnTo(raw: string): string {
  let value = raw;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return value;
}

function resolveReturnTo(request: FastifyRequest): string {
  const incoming = new URL(request.url, 'http://localhost');
  const returnTo = incoming.searchParams.get('return_to');
  if (returnTo) return decodeReturnTo(returnTo);

  const referer = request.headers.referer ?? '';
  if (referer.includes(':8081') || referer.includes('localhost:8081')) {
    return DEFAULT_WEB_CALLBACK;
  }

  return `${MOBILE_AUTH_SCHEME}://auth/callback`;
}

function buildCookieParam(request: FastifyRequest): string | null {
  const incoming = new URL(request.url, 'http://localhost');
  const fromQuery = incoming.searchParams.get('cookie');
  if (fromQuery) return fromQuery;

  const cookieHeader = request.headers.cookie ?? '';
  const match = cookieHeader.match(
    new RegExp(`${SESSION_COOKIE.replace('.', '\\.')}=([^;]+)`)
  );
  if (!match) return null;

  return `${SESSION_COOKIE}=${match[1]}; Path=/; HttpOnly; SameSite=Lax`;
}

function redirectToFinalCallback(request: FastifyRequest): string {
  const target = new URL(resolveReturnTo(request));
  const cookie = buildCookieParam(request);
  if (cookie) {
    target.searchParams.set('cookie', cookie);
  }
  return target.toString();
}

export async function registerBetterAuth(fastify: FastifyInstance) {
  fastify.get('/auth/callback', async (request, reply) => {
    return reply.redirect(redirectToFinalCallback(request));
  });

  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(
        request.url,
        `${request.protocol}://${request.headers.host}`
      );

      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value !== undefined && value !== null) {
          headers.append(key, Array.isArray(value) ? value.join(', ') : String(value));
        }
      }

      let body: string | undefined;
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
        body =
          typeof request.body === 'string'
            ? request.body
            : JSON.stringify(request.body);
      }

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body,
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });

      const text = await response.text();
      if (text) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          reply.send(JSON.parse(text));
        } else {
          reply.send(text);
        }
      } else {
        reply.send();
      }
    },
  });
}
