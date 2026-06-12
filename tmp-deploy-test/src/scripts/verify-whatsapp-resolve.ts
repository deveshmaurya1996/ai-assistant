
import { prisma } from '@ai-assistant/database';
import { resolveBridgeSessionForUser } from '../whatsapp/session-resolve';

const userId = process.argv[2] ?? 'F9OdgkVwBXNLlPsy2ccmZxzbOwAXPYAi';

async function main() {
  const connections = await prisma.userConnection.findMany({
    where: { userId, providerId: 'whatsapp' },
    select: { id: true, status: true, metadata: true },
  });
  console.log('[verify-resolve] DB connections:', JSON.stringify(connections, null, 2));

  const resolved = await resolveBridgeSessionForUser(userId);
  if (!resolved) {
    console.error('[verify-resolve] Could not resolve bridge session');
    process.exit(1);
  }

  console.log('[verify-resolve] OK:', resolved);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[verify-resolve] FAILED:', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
