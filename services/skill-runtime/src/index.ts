import Fastify from 'fastify';
import client from 'prom-client';
import { z } from 'zod';
import { config } from '@ai-assistant/config';
import {
  buildIntegrationManifest,
  capabilityFromLegacyTool,
  capabilityToTool,
  formatManifestForPlanner,
  listCapabilities,
  listCapabilitiesForProviders,
  resolveCapabilityExecution,
  selectProvider,
} from '@ai-assistant/capabilities';
import { validateToolArgs } from '@ai-assistant/tool-schema';
import {
  buildPlannerSkillContext,
  buildSkillCatalog,
  parseAssistantCliCommand,
} from '@ai-assistant/skills';

const PORT = parseInt(
  process.env.SKILL_RUNTIME_PORT ?? process.env.PORT ?? '3014',
  10
);
const TOOL_RUNTIME_URL = config.toolRuntimeUrl.replace(/\/$/, '');

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

async function toolRuntimeFetch(path: string, init?: RequestInit): Promise<Response> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${TOOL_RUNTIME_URL}${normalized}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

async function getUserProviderIds(userId: string): Promise<string[]> {
  const res = await toolRuntimeFetch(
    `/v1/tools/available?userId=${encodeURIComponent(userId)}`
  );
  if (!res.ok) return ['notes'];
  const data = (await res.json()) as {
    connections?: Array<{ providerId: string }>;
  };
  const ids = (data.connections ?? []).map((c) => c.providerId);
  ids.push('notes');
  return [...new Set(ids)];
}

async function main() {
  const app = Fastify({ logger: true });
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  app.get('/health', async () => ({ status: 'ok', service: 'skill-runtime' }));

  app.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  app.get('/v1/capabilities', async (request) => {
    const userId = (request.query as { userId?: string }).userId;
    if (userId) {
      const providers = await getUserProviderIds(userId);
      return { capabilities: listCapabilitiesForProviders(providers) };
    }
    return { capabilities: listCapabilities() };
  });

  app.get('/v1/skills', async () => ({
    skills: buildSkillCatalog(),
  }));

  app.get('/v1/skills/catalog', async () => ({
    skills: buildSkillCatalog(),
    plannerContext: buildPlannerSkillContext(),
  }));

  app.get('/v1/tools/available', async (request) => {
    const userId = (request.query as { userId?: string }).userId;
    const params = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const res = await toolRuntimeFetch(`/v1/tools/available${params}`);
    const data = await res.json();
    return data;
  });

  app.get('/v1/integrations/manifest', async (request) => {
    const userId = (request.query as { userId?: string }).userId;
    if (!userId) {
      const empty = buildIntegrationManifest([]);
      return { manifest: empty, plannerText: formatManifestForPlanner(empty) };
    }

    const res = await toolRuntimeFetch(
      `/v1/tools/available?userId=${encodeURIComponent(userId)}`
    );
    if (!res.ok) {
      const empty = buildIntegrationManifest([]);
      return { manifest: empty, plannerText: formatManifestForPlanner(empty) };
    }

    const data = (await res.json()) as {
      connections?: Array<{ id: string; providerId: string }>;
    };
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
        const availRes = await toolRuntimeFetch(
          `/v1/tools/available?userId=${encodeURIComponent(body.userId)}`
        );
        if (availRes.ok) {
          const availData = (await availRes.json()) as {
            connections?: Array<{ id: string; providerId: string }>;
          };
          const connections = (availData.connections ?? []).map((c) => ({
            id: c.id,
            providerId: c.providerId,
          }));
          const choice = selectProvider(body.capability, connections);
          if (choice) providerId = choice.providerId;
        }
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

    const res = await toolRuntimeFetch('/v1/executions', {
      method: 'POST',
      body: JSON.stringify({
        userId: body.userId,
        tool: legacyTool,
        args: body.args,
        source: body.source,
        confirmed: body.confirmed,
        preview: body.preview,
        ...(body.connectionId ? { connectionId: body.connectionId } : {}),
        ...(body.chatSessionId ? { chatSessionId: body.chatSessionId } : {}),
      }),
    });

    const data = await res.json();
    if (res.status === 428) {
      const capId =
        body.capability ?? capabilityFromLegacyTool(legacyTool)?.id;
      return reply.code(428).send({
        ...data,
        capability: capId,
        tool: legacyTool,
        requiresConfirmation: true,
      });
    }
    if (!res.ok) {
      return reply.code(res.status).send(data);
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

    const res = await toolRuntimeFetch('/v1/executions', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        tool: resolved.legacyTool,
        args: parsed.args,
        source,
        confirmed,
        chatSessionId,
      }),
    });

    const data = await res.json();
    return reply.code(res.status).send({
      ...data,
      capability: parsed.capabilityId,
      tool: resolved.legacyTool,
    });
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[skill-runtime] listening on ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
