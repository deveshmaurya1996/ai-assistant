import { prisma, Role, type ChatSessionKind as PrismaChatSessionKind } from '@ai-assistant/database';

type ChatSessionKind = 'text' | 'voice';
import { config as appConfig } from '@ai-assistant/config';
import { fetchAi } from '../lib/http';
import { forbidden, notFound } from '../lib/errors';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { ingestConversationMemory } from './memory.service';
import { runAgentTurn, type AgentSource } from './agent-turn.service';
import {
  buildConfirmText,
  clearPendingConfirm,
  getPendingConfirm,
  setPendingConfirm,
  usesInlineConfirm,
} from './pending-confirm.service';

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
  _count?: { messages: number };
}) {
  return {
    id: session.id,
    title: session.title,
    kind: toApiSessionKind(session.kind),
    messageCount: session._count?.messages ?? 0,
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
    include: { _count: { select: { messages: true } } },
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

export type ActionConfirmPayload = {
  tool: string;
  args: Record<string, unknown>;
  executionId?: string;
};

export async function processChatMessage(params: {
  userId: string;
  text: string;
  chatSessionId?: string;
  ragEnabled?: boolean;
  source?: 'socket' | 'http';
  agentSource?: AgentSource;
  confirmed?: boolean;
  onChunk: (chunk: string, sessionId: string) => void | Promise<void>;
  onSessionCreated?: (sessionId: string) => void;
  onTitleUpdated?: (sessionId: string, title: string) => void;
  onActionConfirmRequired?: (payload: ActionConfirmPayload) => void;
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

  const agentSource: AgentSource =
    params.agentSource ?? (source === 'socket' ? 'chat' : 'chat');

  const turn = await runAgentTurn(
    {
      userId,
      query: text,
      chatSessionId: sessionId,
      chatHistory: dbHistory.map((m) => ({
        role: toAiRole(m.role),
        content: m.content,
      })),
      ragEnabled,
      preferredModel,
      confirmed: params.confirmed ?? false,
      source: agentSource,
    },
    {
      onToken: (token) => onChunk(token, sessionId),
      onActionConfirmRequired: params.onActionConfirmRequired,
    }
  );

  if (turn.requiresConfirmation && turn.confirmPayload) {
    const payload = turn.confirmPayload;

    if (usesInlineConfirm(payload.tool)) {
      const confirmText = buildConfirmText(payload.tool, payload.args);
      await onChunk(confirmText, sessionId);

      setPendingConfirm(sessionId, {
        tool: payload.tool,
        args: payload.args,
        originalText: text,
        userId,
      });

      const assistantMessage = await prisma.message.create({
        data: {
          chatSessionId: sessionId,
          role: 'ASSISTANT',
          content: confirmText,
        },
      });

      return {
        sessionId,
        userMessage,
        assistantMessage,
        requiresConfirmation: true,
        inlineConfirm: true,
      };
    }

    params.onActionConfirmRequired?.(payload);

    const assistantMessage = await prisma.message.create({
      data: {
        chatSessionId: sessionId,
        role: 'ASSISTANT',
        content: 'Please confirm this action to continue.',
      },
    });

    return {
      sessionId,
      userMessage,
      assistantMessage,
      requiresConfirmation: true,
      modalConfirm: true,
    };
  }

  const accumulated = turn.fullText;

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

async function loadTurnContext(userId: string, sessionId: string) {
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

  return {
    dbHistory,
    preferredModel: rawPreferred.trim(),
  };
}

export async function processInlineConfirmAccept(params: {
  userId: string;
  chatSessionId: string;
  pending: {
    tool: string;
    args: Record<string, unknown>;
    originalText: string;
    userId: string;
  };
  replyText: string;
  ragEnabled?: boolean;
  agentSource?: AgentSource;
  onChunk: (chunk: string, sessionId: string) => void | Promise<void>;
  onTitleUpdated?: (sessionId: string, title: string) => void;
}) {
  const { userId, chatSessionId, pending, replyText, onChunk, onTitleUpdated } = params;
  await assertSessionAccess(userId, chatSessionId);

  const userMessage = await prisma.message.create({
    data: { chatSessionId, role: 'USER', content: replyText },
  });

  const { dbHistory, preferredModel } = await loadTurnContext(userId, chatSessionId);
  const agentSource: AgentSource = params.agentSource ?? 'chat';

  const turn = await runAgentTurn(
    {
      userId,
      query: pending.originalText,
      chatSessionId,
      chatHistory: dbHistory.map((m) => ({
        role: toAiRole(m.role),
        content: m.content,
      })),
      ragEnabled: params.ragEnabled ?? true,
      preferredModel,
      confirmed: true,
      source: agentSource,
    },
    { onToken: (token) => onChunk(token, chatSessionId) }
  );

  if (turn.requiresConfirmation && turn.confirmPayload) {
    throw new Error('Action still requires confirmation after approval');
  }

  const assistantMessage = await prisma.message.create({
    data: {
      chatSessionId,
      role: 'ASSISTANT',
      content: turn.fullText,
    },
  });

  await prisma.chatSession.update({
    where: { id: chatSessionId },
    data: { updatedAt: new Date() },
  });

  ingestConversationMemory(userId, pending.originalText, turn.fullText).catch((err) => {
    console.error('[memory] ingest failed:', err instanceof Error ? err.message : err);
  });

  void maybeAutoTitleSession({
    userId,
    sessionId: chatSessionId,
    userMessage: pending.originalText,
    assistantMessage: turn.fullText,
    preferredModel,
    onTitleUpdated,
  });

  return { sessionId: chatSessionId, userMessage, assistantMessage };
}

export async function processInlineConfirmCancel(params: {
  userId: string;
  chatSessionId: string;
  replyText: string;
}) {
  const { userId, chatSessionId, replyText } = params;
  await assertSessionAccess(userId, chatSessionId);

  const userMessage = await prisma.message.create({
    data: { chatSessionId, role: 'USER', content: replyText },
  });

  const assistantMessage = await prisma.message.create({
    data: {
      chatSessionId,
      role: 'ASSISTANT',
      content: 'Cancelled.',
    },
  });

  await prisma.chatSession.update({
    where: { id: chatSessionId },
    data: { updatedAt: new Date() },
  });

  return { sessionId: chatSessionId, userMessage, assistantMessage };
}
