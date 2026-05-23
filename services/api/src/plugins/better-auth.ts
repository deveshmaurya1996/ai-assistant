import { FastifyInstance } from 'fastify';
import { auth } from '@ai-assistant/auth';

export async function registerBetterAuth(fastify: FastifyInstance) {
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
