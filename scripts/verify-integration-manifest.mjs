import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env') });

const userId = process.argv[2] || '0aZyi8WK7UHdA2rVCRgxul38YVvdWTK9';

const { buildUserIntegrationManifest } = await import(
  '../services/gateway/dist/services/integration-manifest.service.js'
);
const { assessConnectionsHealth } = await import(
  '../services/gateway/dist/services/integration-health.service.js'
);
const { prisma } = await import('../packages/database/dist/index.js');

const connections = await prisma.userConnection.findMany({
  where: { userId },
  select: { id: true, providerId: true, status: true },
});

const health = await assessConnectionsHealth(userId, connections);
const manifest = await buildUserIntegrationManifest(userId);

console.log(JSON.stringify({
  userId,
  dbConnections: connections,
  health: Object.fromEntries(health),
  healthyProviders: manifest.connections.map((c) => c.providerId),
  capabilityCount: manifest.manifest.capabilities.length,
  plannerPreview: manifest.plannerText.slice(0, 600),
  unhealthyNotes: manifest.unhealthyNotes,
}, null, 2));

await prisma.$disconnect();
