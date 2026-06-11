import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  buildIntegrationManifest,
  capabilityFromLegacyTool,
  capabilityToTool,
  formatManifestForPlanner,
  KNOWN_PROVIDER_IDS,
  listCapabilities,
  listCapabilitiesForProviders,
  resolveCapabilityExecution,
  selectProvider,
} from '@ai-assistant/capabilities';
import { validateToolArgs } from '@ai-assistant/tool-schema';
import {
  buildConnectorCatalog,
  formatConnectorsForPlanner,
  parseAssistantCliCommand,
} from '@ai-assistant/connectors';
import type { ToolRuntimeAdapter } from '@ai-assistant/tool-runtime/tool-adapter';
import type { ExecuteBody } from '@ai-assistant/tool-runtime/routes';

const ExecuteSchema = z.object({
  userId: z.string(),
  capability: z.string().optional(),
  tool: z.string().optional(),
  provider: z.string().nullish(),
  args: z.record(z.string(), z.unknown()),
  source: z.enum(['chat', 'voice', 'automation', 'workflow', 'manual']).default('chat'),
  confirmed: z.boolean().default(false),
  preview: z.boolean().optional(),
  connectionId: z.string().nullish(),
  chatSessionId: z.string().nullish(),
});

async function getUserProviderIds(
  toolAdapter: ToolRuntimeAdapter,
  userId: string
): Promise<string[]> {
  const data = await toolAdapter.getToolsAvailable(userId);
  return [...new Set<string>((data.connections ?? []).map((c: { providerId: string }) => c.providerId))];
}

export async function registerCapabilityRuntimeRoutes(
  app: FastifyInstance,
  toolAdapter: ToolRuntimeAdapter
): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', service: 'capability-runtime' }));

  app.get('/v1/capabilities', async (request) => {
    const userId = (request.query as { userId?: string }).userId;
    if (userId) {
      const providers = await getUserProviderIds(toolAdapter, userId);
      return { capabilities: listCapabilitiesForProviders(providers) };
    }
    return { capabilities: listCapabilities() };
  });

  app.get('/v1/connectors', async () => ({
    connectors: buildConnectorCatalog(),
  }));

  app.get('/v1/connectors/catalog', async (request) => {
    const readyProviders = (
      (request.query as { readyProviders?: string }).readyProviders ?? ''
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const connectors = buildConnectorCatalog();
    return {
      connectors,
      plannerContext: formatConnectorsForPlanner(
        readyProviders.length > 0 ? readyProviders : [...KNOWN_PROVIDER_IDS]
      ),
    };
  });

  app.get('/v1/tools/available', async (request) => {
    const userId = (request.query as { userId?: string }).userId;
    return toolAdapter.getToolsAvailable(userId);
  });

  app.get('/v1/integrations/manifest', async (request) => {
    const userId = (request.query as { userId?: string }).userId;
    if (!userId) {
      const empty = buildIntegrationManifest([]);
      return { manifest: empty, plannerText: formatManifestForPlanner(empty) };
    }

    const data = await toolAdapter.getToolsAvailable(userId);
    const connections = data.connections ?? [];
    const manifest = buildIntegrationManifest(connections);
    return {
      manifest,
      plannerText: formatManifestForPlanner(manifest),
      connections,
    };
  });

  app.post('/v1/execute', async (request, reply) => {
    const body = ExecuteSchema.parse(request.body);

    let legacyTool = body.tool;
    let providerId = body.provider ?? undefined;

    if (!legacyTool && body.capability) {
      if (!providerId) {
        const availData = await toolAdapter.getToolsAvailable(body.userId);
        const connections = (availData.connections ?? []).map((c: { id: string; providerId: string }) => ({
          id: c.id,
          providerId: c.providerId,
        }));
        const choice = selectProvider(body.capability, connections);
        if (choice) providerId = choice.providerId;
      }
      legacyTool = capabilityToTool(body.capability, providerId);
      if (!legacyTool) {
        return reply.code(400).send({ error: `Unknown capability: ${body.capability}` });
      }
    }

    if (!legacyTool) {
      return reply.code(400).send({ error: 'capability or tool is required' });
    }

    const validation = validateToolArgs(legacyTool, body.args);
    if (!validation.success) {
      return reply.code(400).send({ error: validation.error });
    }

    const execBody: ExecuteBody = {
      userId: body.userId,
      tool: legacyTool,
      args: body.args,
      source: body.source,
      confirmed: body.confirmed,
      preview: body.preview,
      connectionId: body.connectionId,
      chatSessionId: body.chatSessionId,
    };

    const { status, body: data } = await toolAdapter.startExecution(execBody);

    if (status === 428) {
      const capId = body.capability ?? capabilityFromLegacyTool(legacyTool)?.id;
      return reply.code(428).send({
        ...data,
        capability: capId,
        tool: legacyTool,
        requiresConfirmation: true,
      });
    }
    if (status >= 400) {
      return reply.code(status).send(data);
    }

    return reply.code(201).send({
      ...data,
      capability: body.capability ?? capabilityFromLegacyTool(legacyTool)?.id,
      tool: legacyTool,
    });
  });

  app.post('/v1/cli', async (request, reply) => {
    const { command, userId, source, confirmed, chatSessionId } = z
      .object({
        command: z.string(),
        userId: z.string(),
        source: z
          .enum(['chat', 'voice', 'automation', 'workflow', 'manual'])
          .default('chat'),
        confirmed: z.boolean().default(false),
        chatSessionId: z.string().optional(),
      })
      .parse(request.body);

    const parsed = parseAssistantCliCommand(command);
    if (!parsed) {
      return reply.code(400).send({ error: 'Invalid assistant CLI command' });
    }

    const resolved = resolveCapabilityExecution(parsed.capabilityId, parsed.providerId);
    if (!resolved) {
      return reply.code(400).send({ error: `Unknown capability: ${parsed.capabilityId}` });
    }

    const { status, body: data } = await toolAdapter.startExecution({
      userId,
      tool: resolved.legacyTool,
      args: parsed.args,
      source,
      confirmed,
      chatSessionId,
    });

    return reply.code(status).send({
      ...data,
      capability: parsed.capabilityId,
      tool: resolved.legacyTool,
    });
  });
}

