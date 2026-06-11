import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '@ai-assistant/config';
import { correlationHeaders } from '../lib/request-context';

const UPSTREAM = config.intelligenceUpstreamUrl.replace(/\/$/, '');

async function proxyToIntelligence(
  request: FastifyRequest,
  reply: FastifyReply,
  upstreamPath: string
): Promise<void> {
  const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
  const url = `${UPSTREAM}${upstreamPath}${query}`;

  const headers: Record<string, string> = {
    ...correlationHeaders((request as { requestId?: string }).requestId),
  };

  const contentType = request.headers['content-type'];
  if (typeof contentType === 'string') {
    headers['Content-Type'] = contentType;
  }
  const accept = request.headers.accept;
  if (typeof accept === 'string') {
    headers.Accept = accept;
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (request.body !== undefined && request.body !== null) {
      init.body =
        typeof request.body === 'string' || Buffer.isBuffer(request.body)
          ? (request.body as BodyInit)
          : JSON.stringify(request.body);
    }
  }

  const upstream = await fetch(url, init);

  reply.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection') return;
    reply.header(key, value);
  });

  if (!upstream.body) {
    reply.send();
    return;
  }

  const nodeStream = Readable.fromWeb(upstream.body as import('stream/web').ReadableStream);
  reply.hijack();
  await pipeline(nodeStream, reply.raw);
}

export async function registerIntelligenceProxy(app: FastifyInstance): Promise<void> {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const wildcard = (request.params as { '*': string })['*'] ?? '';
    const upstreamPath = wildcard ? `/v1/${wildcard}` : '/v1';
    await proxyToIntelligence(request, reply, upstreamPath);
  };

  app.all('/internal/v1/intelligence', handler);
  app.all('/internal/v1/intelligence/*', handler);
}
