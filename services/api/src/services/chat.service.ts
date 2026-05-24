import { prisma, Role } from '@ai-assistant/database';
import { config as appConfig } from '@ai-assistant/config';
import { streamAi } from '../lib/http';
import { forbidden, notFound } from '../lib/errors';
import {
  parseSseBuffer,
  type ChatErrorPayload,
  type ChatTokenPayload,
} from '../lib/sse';
import { ingestConversationMemory } from './memory.service';

export type ChatHistoryMessage = { role: string; content: string };

export async function listSessions(userId: string) {
  return prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getSessionMessages(userId: string, sessionId: string) {
  await assertSessionAccess(userId, sessionId);
  return prisma.message.findMany({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createSession(userId: string, title?: string) {
  return prisma.chatSession.create({
    data: {
      userId,
      title: title?.trim() || 'New Chat',
    },
  });
}

export async function deleteSession(userId: string, sessionId: string) {
  await assertSessionAccess(userId, sessionId);
  await prisma.chatSession.delete({ where: { id: sessionId } });
}

async function assertSessionAccess(userId: string, sessionId: string) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound('Chat session not found');
  if (session.userId !== userId) throw forbidden('Access denied to this chat session');
  return session;
}

export async function resolveOrCreateSession(
  userId: string,
  text: string,
  chatSessionId?: string
) {
  if (chatSessionId) {
    await assertSessionAccess(userId, chatSessionId);
    return chatSessionId;
  }

  const session = await prisma.chatSession.create({
    data: {
      userId,
      title: text.length > 30 ? `${text.slice(0, 27)}...` : text,
    },
  });
  return session.id;
}

function toAiRole(role: Role): string {
  if (role === 'USER') return 'user';
  if (role === 'ASSISTANT') return 'assistant';
  return 'system';
}

export async function processChatMessage(params: {
  userId: string;
  text: string;
  chatSessionId?: string;
  ragEnabled?: boolean;
  onChunk: (chunk: string, sessionId: string) => void | Promise<void>;
  onSessionCreated?: (sessionId: string) => void;
}) {
  const { userId, text, ragEnabled = true, onChunk, onSessionCreated } = params;
  const isNew = !params.chatSessionId;
  const sessionId = await resolveOrCreateSession(userId, text, params.chatSessionId);

  if (isNew) {
    onSessionCreated?.(sessionId);
  }

  const userMessage = await prisma.message.create({
    data: { chatSessionId: sessionId, role: 'USER', content: text },
  });

  const dbHistory = await prisma.message.findMany({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const settings = (user?.settings as Record<string, unknown> | null) ?? {};
  const rawPreferred =
    typeof settings.preferredModel === 'string'
      ? settings.preferredModel
      : appConfig.primaryModel;
  const preferredModel = rawPreferred.trim();

  const stream = await streamAi('/v1/chat/stream', {
    query: text,
    rag_enabled: ragEnabled,
    chat_history: dbHistory.map((m) => ({
      role: toAiRole(m.role),
      content: m.content,
    })),
    user_id: userId,
    preferred_model: preferredModel,
  });

  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let accumulated = '';
  let sseBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });

    const { events, rest } = parseSseBuffer(sseBuffer);
    sseBuffer = rest;

    for (const ev of events) {
      if (ev.event === 'token') {
        const payload = JSON.parse(ev.data) as ChatTokenPayload;
        if (payload.content) {
          accumulated += payload.content;
          await onChunk(payload.content, sessionId);
        }
      } else if (ev.event === 'error') {
        const payload = JSON.parse(ev.data) as ChatErrorPayload;
        const message = payload.message ?? 'Stream error';
        accumulated += `\n[${message}]\n`;
        await onChunk(`\n[${message}]\n`, sessionId);
      }
    }
  }

  if (sseBuffer.trim()) {
    const { events } = parseSseBuffer(`${sseBuffer}\n\n`);
    for (const ev of events) {
      if (ev.event === 'token') {
        const payload = JSON.parse(ev.data) as ChatTokenPayload;
        if (payload.content) {
          accumulated += payload.content;
          await onChunk(payload.content, sessionId);
        }
      }
    }
  }

  const assistantMessage = await prisma.message.create({
    data: {
      chatSessionId: sessionId,
      role: 'ASSISTANT',
      content: accumulated,
    },
  });

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });

  ingestConversationMemory(userId, text, accumulated).catch((err) => {
    console.error('[memory] ingest failed:', err instanceof Error ? err.message : err);
  });

  return { sessionId, userMessage, assistantMessage };
}
