import { FastifyInstance } from 'fastify';
import type { ToolSource } from '@ai-assistant/types';
import { buildUserIntegrationManifest } from '../services/integration-manifest.service';
import { executeIntegrationTool } from '../services/integration-exec.service';

const SEND_REQUIRES_CONFIRM = new Set(['whatsapp.send_message']);

export async function internalIntegrationRoutes(fastify: FastifyInstance) {
  fastify.get('/integrations/manifest', async (request, reply) => {
    const userId = (request.query as { userId?: string }).userId?.trim();
    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    const { manifest, plannerText, connections, connectionStates, supportedProviders } =
      await buildUserIntegrationManifest(userId);
    return reply.send({
      manifest,
      plannerText,
      connections,
      connectionStates,
      supportedProviders,
    });
  });

  fastify.post('/integrations/whatsapp/execute', async (request, reply) => {
    const body = request.body as {
      userId?: string;
      tool?: string;
      args?: Record<string, unknown>;
      source?: ToolSource;
      confirmed?: boolean;
      connectionId?: string;
      chatSessionId?: string;
    };

    const userId = body.userId?.trim();
    const tool = body.tool?.trim();
    if (!userId || !tool) {
      return reply.code(400).send({ error: 'userId and tool are required' });
    }
    if (!tool.startsWith('whatsapp.')) {
      return reply.code(400).send({ error: 'Only whatsapp.* tools are supported on this route' });
    }

    const confirmed = body.confirmed ?? false;
    const args = body.args ?? {};

    if (SEND_REQUIRES_CONFIRM.has(tool) && !confirmed) {
      return reply.code(428).send({
        requiresConfirmation: true,
        tool,
        args,
        error: 'User confirmation required before sending WhatsApp messages',
      });
    }

    const outcome = await executeIntegrationTool({
      userId,
      tool,
      args,
      source: body.source ?? 'chat',
      confirmed,
      connectionId: body.connectionId,
      chatSessionId: body.chatSessionId,
    });

    if (!outcome.success) {
      return reply.code(400).send({
        success: false,
        tool,
        error: outcome.error ?? 'WhatsApp action failed',
      });
    }

    return reply.send({
      success: true,
      tool,
      result: outcome.result,
      status: 'completed',
    });
  });
}
