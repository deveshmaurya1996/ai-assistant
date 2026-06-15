import { prisma } from '@ai-assistant/database';

export async function getUserPreferredModelId(userId: string): Promise<string | undefined> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  if (!user?.settings || typeof user.settings !== 'object') return undefined;
  const id = (user.settings as { preferredModelId?: unknown }).preferredModelId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}
