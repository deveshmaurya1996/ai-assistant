import { prisma } from '@ai-assistant/database';

function fallbackTitle(content: string): string {
  const line = content.trim().split(/\n+/)[0]?.replace(/\s+/g, ' ') ?? '';
  if (!line) return 'Note';
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

async function resolveTitle(content: string, title?: string): Promise<string> {
  if (title?.trim()) return title.trim();
  return fallbackTitle(content);
}

export async function executeNotesTool(
  userId: string,
  tool: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (tool === 'notes.create') {
    const content = String(args.content ?? '').trim();
    if (!content) {
      return { success: false, error: 'Note content is required' };
    }
    const title = await resolveTitle(content, args.title ? String(args.title) : undefined);
    const note = await prisma.userNote.create({
      data: { userId, title, content },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      success: true,
      data: {
        ...note,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
    };
  }

  if (tool === 'notes.search') {
    const q = String(args.query ?? '').trim().toLowerCase();
    const notes = await prisma.userNote.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
    });
    const results = q
      ? notes.filter(
          (n) =>
            n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
        )
      : notes;
    return {
      success: true,
      data: {
        results: results.map((n) => ({
          ...n,
          createdAt: n.createdAt.toISOString(),
          updatedAt: n.updatedAt.toISOString(),
        })),
      },
    };
  }

  return { success: false, error: `Unknown notes tool: ${tool}` };
}
