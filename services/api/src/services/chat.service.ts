import { prisma, Role, type ChatSessionKind as PrismaChatSessionKind } from '@ai-assistant/database';

type ChatSessionKind = 'text' | 'voice';
import { config as appConfig } from '@ai-assistant/config';
import { fetchAi, streamAi } from '../lib/http';
import { forbidden, notFound } from '../lib/errors';
import {
  parseSseBuffer,
  type ChatErrorPayload,
  type ChatTokenPayload,
} from '../lib/sse';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { ingestConversationMemory } from './memory.service';

export type ChatHistoryMessage = { role: string; content: string };

const PLACEHOLDER_TITLES = new Set(['', 'new chat', 'untitled']);

function toApiSessionKind(kind: PrismaChatSessionKind): ChatSessionKind {
  return kind === 'VOICE' ? 'voice' : 'text';
}

function toPrismaSessionKind(kind?: ChatSessionKind): PrismaChatSessionKind {
  return kind === 'voice' ? 'VOICE' : 'TEXT';
}

function serializeSession(session: {
  id: string;
  title: string | null;
  kind: PrismaChatSessionKind;
}) {
  return {
    id: session.id,
    title: session.title,
    kind: toApiSessionKind(session.kind),
  };
}

function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  return PLACEHOLDER_TITLES.has(title.trim().toLowerCase());
}

export async function listSessions(userId: string) {
  const sessions = await prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return sessions.map(serializeSession);
}

export async function getSession(userId: string, sessionId: string) {
  const session = await assertSessionAccess(userId, sessionId);
  return serializeSession(session);
}

export async function getSessionMessages(userId: string, sessionId: string) {
  await assertSessionAccess(userId, sessionId);
  return prisma.message.findMany({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createSession(
  userId: string,
  options?: { title?: string; kind?: ChatSessionKind }
) {
  const kind = toPrismaSessionKind(options?.kind);
  const defaultTitle = kind === 'VOICE' ? 'Voice chat' : 'New Chat';
  const session = await prisma.chatSession.create({
    data: {
      userId,
      title: options?.title?.trim() || defaultTitle,
      kind,
    },
  });
  return serializeSession(session);
}

export async function deleteSession(userId: string, sessionId: string) {
  await assertSessionAccess(userId, sessionId);
  await prisma.chatSession.delete({ where: { id: sessionId } });
}

export async function assertSessionAccess(userId: string, sessionId: string) {
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

function parseSsePayload<T>(data: string, fallback: T): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

export async function maybeAutoTitleSession(params: {
  userId: string;
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  preferredModel: string;
  onTitleUpdated?: (sessionId: string, title: string) => void;
}): Promise<void> {
  const { userId, sessionId, userMessage, assistantMessage, preferredModel, onTitleUpdated } =
    params;

  try {
    const session = await assertSessionAccess(userId, sessionId);
    if (!isPlaceholderTitle(session.title)) return;

    const messageCount = await prisma.message.count({
      where: { chatSessionId: sessionId },
    });
    if (messageCount !== 2) return;

    const { title } = await fetchAi<{ title: string }>('/v1/chat/title', {
      method: 'POST',
      body: JSON.stringify({
        user_message: userMessage,
        assistant_message: assistantMessage,
        preferred_model: preferredModel,
      }),
    });

    const trimmed = title?.trim();
    if (!trimmed || isPlaceholderTitle(trimmed)) return;

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title: trimmed },
    });

    onTitleUpdated?.(sessionId, trimmed);
  } catch (err) {
    console.error(
      '[chat] auto-title failed:',
      err instanceof Error ? err.message : err
    );
  }
}

export async function processChatMessage(params: {
  userId: string;
  text: string;
  chatSessionId?: string;
  ragEnabled?: boolean;
  source?: 'socket' | 'http';
  onChunk: (chunk: string, sessionId: string) => void | Promise<void>;
  onSessionCreated?: (sessionId: string) => void;
  onTitleUpdated?: (sessionId: string, title: string) => void;
}) {
  const {
    userId,
    text,
    ragEnabled = true,
    source = 'socket',
    onChunk,
    onSessionCreated,
    onTitleUpdated,
  } = params;
  const isNew = !params.chatSessionId;
  const sessionId = await resolveOrCreateSession(userId, text, params.chatSessionId);

  if (isNew) {
    onSessionCreated?.(sessionId);
    publishEvent(EventNames.CHAT_STARTED, {
      userId,
      sessionId,
      source,
    }).catch(() => undefined);
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
        const payload = parseSsePayload<ChatTokenPayload>(ev.data, { content: '' });
        if (payload.content) {
          accumulated += payload.content;
          await onChunk(payload.content, sessionId);
        }
      } else if (ev.event === 'error') {
        const payload = parseSsePayload<ChatErrorPayload>(ev.data, {
          message: 'Stream error',
        });
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
        const payload = parseSsePayload<ChatTokenPayload>(ev.data, { content: '' });
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

  void maybeAutoTitleSession({
    userId,
    sessionId,
    userMessage: text,
    assistantMessage: accumulated,
    preferredModel,
    onTitleUpdated,
  });

  return { sessionId, userMessage, assistantMessage };
}
