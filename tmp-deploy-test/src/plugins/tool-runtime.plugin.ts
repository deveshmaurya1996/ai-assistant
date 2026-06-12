import type { FastifyInstance } from 'fastify';
import { registerToolRuntimeRoutes } from '@ai-assistant/tool-runtime/routes';

export async function registerToolRuntimePlugin(app: FastifyInstance): Promise<void> {
  await registerToolRuntimeRoutes(app);
}
