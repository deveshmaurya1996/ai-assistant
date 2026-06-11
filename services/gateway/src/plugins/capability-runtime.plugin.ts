import type { FastifyInstance } from 'fastify';
import { createInProcessToolAdapter } from '@ai-assistant/tool-runtime/tool-adapter';
import { registerCapabilityRuntimeRoutes } from '@ai-assistant/capability-runtime/routes';

export async function registerCapabilityRuntimePlugin(app: FastifyInstance): Promise<void> {
  await registerCapabilityRuntimeRoutes(app, createInProcessToolAdapter());
}
