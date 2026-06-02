import Fastify from 'fastify';
import { checkToolPermission } from '@ai-assistant/permissions';
import { capabilityToTool } from '@ai-assistant/capabilities';
import type { ToolSource } from '@ai-assistant/types';

const PORT = parseInt(process.env.POLICY_ENGINE_PORT ?? '3018', 10);

async function main() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'policy-engine' }));

  app.post('/v1/check', async (request) => {
    const body = request.body as {
      capability?: string;
      tool?: string;
      userId: string;
      source: ToolSource;
      confirmed: boolean;
      provider?: string;
    };

    const tool =
      body.tool ??
      (body.capability ? capabilityToTool(body.capability, body.provider) : undefined);

    if (!tool) {
      return { allowed: false, reason: 'Unknown capability or tool' };
    }

    return checkToolPermission({
      tool,
      source: body.source,
      confirmed: body.confirmed,
      userId: body.userId,
    });
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[policy-engine] listening on ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
