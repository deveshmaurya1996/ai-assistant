import { prisma } from '@ai-assistant/database';

export type ContactMatch = {
  name: string;
  preferredChannel: 'whatsapp' | 'email' | 'phone';
  address: string;
  confidence: number;
};

export async function contactDomainResolvePerson(
  userId: string,
  name: string
): Promise<ContactMatch[]> {
  const needle = name.trim();
  if (!needle) return [];

  const matches: ContactMatch[] = [];

  const threads = await prisma.chatThread.findMany({
    where: {
      userId,
      provider: 'whatsapp',
      displayName: { contains: needle, mode: 'insensitive' },
    },
    take: 5,
  });

  for (const t of threads) {
    const display = t.displayName ?? t.externalJid;
    const confidence =
      display.toLowerCase() === needle.toLowerCase()
        ? 1
        : display.toLowerCase().startsWith(needle.toLowerCase())
          ? 0.85
          : 0.7;
    matches.push({
      name: display,
      preferredChannel: 'whatsapp',
      address: t.externalJid,
      confidence,
    });
  }

  const resources = await prisma.indexedResource.findMany({
    where: {
      connection: { userId, status: 'ACTIVE' },
      resourceType: 'contact',
      title: { contains: needle, mode: 'insensitive' },
    },
    take: 5,
  });

  for (const r of resources) {
    const email = (r.metadata as { email?: string } | null)?.email ?? r.externalId;
    if (email.includes('@')) {
      matches.push({
        name: r.title ?? email,
        preferredChannel: 'email',
        address: email,
        confidence: 0.75,
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}
