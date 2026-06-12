import { prisma } from '@ai-assistant/database';
import { fetchAi } from '../lib/http';
import { assertSessionAccess } from './chat.service';

function fallbackTitle(content: string): string {
  const line = content.trim().split(/\n+/)[0]?.replace(/\s+/g, ' ') ?? '';
  if (!line) return 'Note';
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

function scheduleNoteTitleRefresh(noteId: string, content: string): void {
  void generateNoteTitle(content)
    .then((title) =>
      prisma.userNote.update({
        where: { id: noteId },
        data: { title },
      })
    )
    .catch(() => undefined);
}

export async function generateNoteTitle(content: string): Promise<string> {
  const trimmed = content.trim();
  if (!trimmed) return 'Note';

  try {
    const { title } = await fetchAi<{ title: string }>('/v1/chat/title', {
      method: 'POST',
      body: JSON.stringify({
        user_message: trimmed.slice(0, 500),
        assistant_message: '',
      }),
    });
    const t = title?.trim();
    if (t && t.length > 0 && t.toLowerCase() !== 'new chat') {
      return t.length > 120 ? `${t.slice(0, 117)}...` : t;
    }
  } catch {
    /* use fallback */
  }

  return fallbackTitle(trimmed);
}

export async function listNotes(userId: string) {
  return prisma.userNote.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      sourceMessageId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createNote(
  userId: string,
  content: string,
  title?: string,
  sourceMessageId?: string
) {
  const body = content.trim();
  if (!body) {
    throw new Error('Note content is required');
  }

  if (sourceMessageId) {
    const message = await prisma.message.findFirst({
      where: {
        id: sourceMessageId,
        chatSession: { userId },
      },
      select: { id: true },
    });
    if (!message) {
      throw new Error('Message not found');
    }

    const existing = await prisma.userNote.findFirst({
      where: { userId, sourceMessageId },
      select: { id: true },
    });
    if (existing) {
      const quickTitle = title?.trim() || fallbackTitle(body);
      const updated = await prisma.userNote.update({
        where: { id: existing.id },
        data: {
          content: body,
          title: quickTitle,
        },
        select: {
          id: true,
          title: true,
          content: true,
          sourceMessageId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!title?.trim()) {
        scheduleNoteTitleRefresh(updated.id, body);
      }
      return updated;
    }
  }

  const quickTitle = title?.trim() || fallbackTitle(body);

  const created = await prisma.userNote.create({
    data: {
      userId,
      title: quickTitle,
      content: body,
      sourceMessageId: sourceMessageId ?? null,
    },
    select: {
      id: true,
      title: true,
      content: true,
      sourceMessageId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!title?.trim()) {
    scheduleNoteTitleRefresh(created.id, body);
  }

  return created;
}

export async function deleteNoteBySourceMessageId(userId: string, sourceMessageId: string) {
  const existing = await prisma.userNote.findFirst({
    where: { userId, sourceMessageId },
    select: { id: true, sourceMessageId: true },
  });
  if (!existing) {
    return { deleted: false as const, sourceMessageId };
  }
  await prisma.userNote.delete({ where: { id: existing.id } });
  return { deleted: true as const, sourceMessageId: existing.sourceMessageId };
}

export async function deleteNote(userId: string, noteId: string) {
  const existing = await prisma.userNote.findFirst({
    where: { id: noteId, userId },
    select: { id: true, sourceMessageId: true },
  });
  if (!existing) {
    throw new Error('Note not found');
  }
  await prisma.userNote.delete({ where: { id: noteId } });
  return existing;
}

export async function getSavedMessageIds(userId: string, sessionId: string) {
  await assertSessionAccess(userId, sessionId);

  const notes = await prisma.userNote.findMany({
    where: {
      userId,
      sourceMessageId: { not: null },
      sourceMessage: { chatSessionId: sessionId },
    },
    select: { sourceMessageId: true },
  });

  return notes
    .map((n) => n.sourceMessageId)
    .filter((id): id is string => Boolean(id));
}

export async function searchNotes(userId: string, query: string) {
  const q = query.trim().toLowerCase();
  const notes = await listNotes(userId);
  if (!q) return notes;
  return notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
  );
}
