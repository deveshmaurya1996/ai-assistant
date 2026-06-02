import { buildDefaultAttachmentQuery, resolveAssistantContext, normalizePersonalityId, type ChatAttachmentRef } from '@ai-assistant/types';
import { prisma, Prisma, Role, type ChatSessionKind as PrismaChatSessionKind } from '@ai-assistant/database';
import {
  buildRetrievalContextForAttachments,
  resolveAttachments,
} from './file-resolver.service';
import { toChatAttachmentRef, uploadUserFile } from './file.service';
import { updateSessionFileContext } from './file-registry.service';

type ChatSessionKind = 'text' | 'voice';
import { fetchAi } from '../lib/http';
import { forbidden, notFound } from '../lib/errors';
import { EventNames, publishEvent } from '@ai-assistant/events';
import { ingestConversationMemory } from './memory.service';
import { runAgentTurn, type AgentSource } from './agent-turn.service';
import { ChatTurnAbortedError } from './chat-turn-errors';
import {
  buildConfirmText,
  clearPendingConfirm,
  getPendingConfirm,
  setPendingConfirm,
  usesInlineConfirm,
} from './pending-confirm.service';
import { executeIntegrationTool } from './integration-exec.service';

export type ChatHistoryMessage = { role: string; content: string };

const PLACEHOLDER_TITLES = new Set(['', 'new chat', 'untitled', 'voice chat']);
const DEFAULT_TEXT_SESSION_TITLE = 'New Chat';
const DEFAULT_VOICE_SESSION_TITLE = 'Voice chat';

function isRagGloballyEnabled(): boolean {
  const raw = (process.env.RAG_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
}

export function resolveRagEnabled(explicit?: boolean): boolean {
  if (!isRagGloballyEnabled()) return false;
  if (explicit === false) return false;
  return true;
}

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

function isFirstMessageTitle(title: string | null | undefined, firstMessage: string): boolean {
  if (!title) return false;
  const normalizedTitle = title.trim();
  const normalizedMessage = firstMessage.trim();
  if (!normalizedMessage) return false;
  if (normalizedTitle === normalizedMessage) return true;
  if (normalizedMessage.length > 30 && normalizedTitle === `${normalizedMessage.slice(0, 27)}...`) {
    return true;
  }
  return false;
}

function shouldAutoTitle(
  title: string | null | undefined,
  userMessage: string
): boolean {
  return isPlaceholderTitle(title) || isFirstMessageTitle(title, userMessage);
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

function attachmentsFromMetadata(metadata: unknown): ChatAttachmentRef[] | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as { attachments?: unknown }).attachments;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw as ChatAttachmentRef[];
}

export function mapApiMessage(message: {
  id: string;
  role: Role;
  content: string;
  metadata?: unknown | null;
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: attachmentsFromMetadata(message.metadata ?? null),
  };
}

export async function getSessionMessages(userId: string, sessionId: string) {
  await assertSessionAccess(userId, sessionId);
  const rows = await prisma.message.findMany({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(mapApiMessage);
}

export async function createSession(
  userId: string,
  options?: { title?: string; kind?: ChatSessionKind }
) {
  const kind = toPrismaSessionKind(options?.kind);
  const defaultTitle =
    kind === 'VOICE' ? DEFAULT_VOICE_SESSION_TITLE : DEFAULT_TEXT_SESSION_TITLE;
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
      title: DEFAULT_TEXT_SESSION_TITLE,
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
  onTitleUpdated?: (sessionId: string, title: string) => void;
}): Promise<void> {
  const { userId, sessionId, userMessage, assistantMessage, onTitleUpdated } = params;

  try {
    const session = await assertSessionAccess(userId, sessionId);
    if (!shouldAutoTitle(session.title, userMessage)) return;

    const messageCount = await prisma.message.count({
      where: { chatSessionId: sessionId },
    });
    if (messageCount !== 2) return;

    const { title } = await fetchAi<{ title: string }>('/v1/chat/title', {
      method: 'POST',
      body: JSON.stringify({
        user_message: userMessage,
        assistant_message: assistantMessage,
      }),
      signal:
        typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(20_000)
          : undefined,
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
  attachments?: ChatAttachmentRef[];
  ragEnabled?: boolean;
  source?: 'socket' | 'http';
  agentSource?: AgentSource;
  confirmed?: boolean;
  personalityId?: string;
  assistantDisplayName?: string;
  onChunk: (chunk: string, sessionId: string) => void | Promise<void>;
  onSessionCreated?: (sessionId: string) => void;
  onTitleUpdated?: (sessionId: string, title: string) => void;
  onActionConfirmRequired?: (payload: ActionConfirmPayload) => void;
  onModelUsed?: (sessionId: string, modelId: string, label?: string) => void;
  signal?: AbortSignal;
}) {
  const {
    userId,
    text,
    attachments = [],
    source = 'socket',
    onChunk,
    onSessionCreated,
    onTitleUpdated,
  } = params;
  const ragEnabled = resolveRagEnabled(params.ragEnabled);
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
    data: {
      chatSessionId: sessionId,
      role: 'USER',
      content: text,
      metadata:
        attachments.length > 0
          ? ({ attachments } as unknown as Prisma.InputJsonValue)
          : undefined,
    },
  });

  const dbHistory = await prisma.message.findMany({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  const agentSource: AgentSource =
    params.agentSource ?? (source === 'socket' ? 'chat' : 'chat');

  const resolvedAttachments = await resolveAttachments(userId, attachments, {
    query: text,
    sessionId,
    forceInline: true,
  });

  const agentQuery =
    text.trim() ||
    (attachments.length > 0 ? buildDefaultAttachmentQuery(resolvedAttachments) : '');

  const fileRetrievalContext = await buildRetrievalContextForAttachments(
    userId,
    attachments,
    text || agentQuery,
    sessionId
  );

  if (attachments.length > 0) {
    await updateSessionFileContext(sessionId, {
      lastReferencedFileIds: attachments.map((a) => a.id),
    });
  }

  if (attachments.length > 0) {
    console.info('[chat] processing message with attachments', {
      sessionId,
      attachmentCount: attachments.length,
      kinds: attachments.map((a) => a.kind),
      resolvedWithImage: resolvedAttachments.filter((r) => r.imageDataUrl).length,
      resolvedWithExcerpt: resolvedAttachments.filter((r) => r.textExcerpt).length,
      resolvedWithNote: resolvedAttachments.filter((r) => r.note).length,
      queryChars: agentQuery.length,
    });
  }

  const assistantContext = resolveAssistantContext(
    normalizePersonalityId(params.personalityId),
    params.assistantDisplayName
  );

  let turn;
  try {
    turn = await runAgentTurn(
      {
        userId,
        query: agentQuery,
        chatSessionId: sessionId,
        chatHistory: dbHistory.map((m) => ({
          role: toAiRole(m.role),
          content: m.content,
        })),
        attachments,
        resolvedAttachments,
        ragEnabled,
        confirmed: params.confirmed ?? false,
        source: agentSource,
        personalityId: assistantContext.personalityId,
        assistantDisplayName: assistantContext.displayName,
        systemPrompt: assistantContext.systemPrompt,
        fileRetrievalContext,
      },
      {
        onToken: (token) => onChunk(token, sessionId),
        onActionConfirmRequired: params.onActionConfirmRequired,
        onModelUsed: (modelId, label) =>
          params.onModelUsed?.(sessionId, modelId, label),
        onImageGenerated: async ({ imageBase64, mimeType }) => {
          const buffer = Buffer.from(imageBase64, 'base64');
          const ext = mimeType.includes('png') ? 'png' : 'jpg';
          const asset = await uploadUserFile({
            userId,
            filename: `generated-${Date.now()}.${ext}`,
            mimeType,
            buffer,
          });
          return toChatAttachmentRef(asset);
        },
      },
      { signal: params.signal }
    );
  } catch (err) {
    if (err instanceof ChatTurnAbortedError) {
      const partial = err.partialText.trim();
      if (!partial) {
        return {
          sessionId,
          userMessage: mapApiMessage(userMessage),
          assistantMessage: null,
          aborted: true as const,
        };
      }

      const assistantMessage = await prisma.message.create({
        data: {
          chatSessionId: sessionId,
          role: 'ASSISTANT',
          content: partial,
        },
      });

      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });

      return {
        sessionId,
        userMessage: mapApiMessage(userMessage),
        assistantMessage: mapApiMessage(assistantMessage),
        aborted: true as const,
      };
    }
    throw err;
  }

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
        userMessage: mapApiMessage(userMessage),
        assistantMessage: mapApiMessage(assistantMessage),
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
      userMessage: mapApiMessage(userMessage),
      assistantMessage: mapApiMessage(assistantMessage),
      requiresConfirmation: true,
      modalConfirm: true,
    };
  }

  const accumulated = turn.fullText;

  const assistantAttachments = turn.generatedAttachments ?? [];
  const assistantMessage = await prisma.message.create({
    data: {
      chatSessionId: sessionId,
      role: 'ASSISTANT',
      content: accumulated,
      metadata:
        assistantAttachments.length > 0
          ? ({ attachments: assistantAttachments } as unknown as Prisma.InputJsonValue)
          : undefined,
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
    userMessage: text.trim() || agentQuery,
    assistantMessage: accumulated,
    onTitleUpdated,
  });

  return {
    sessionId,
    userMessage: mapApiMessage(userMessage),
    assistantMessage: mapApiMessage(assistantMessage),
    modelUsed: turn.modelUsed,
    modelLabel: turn.modelLabel,
  };
}

async function loadTurnContext(userId: string, sessionId: string) {
  const dbHistory = await prisma.message.findMany({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  return { dbHistory };
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
  signal?: AbortSignal;
}) {
  const { userId, chatSessionId, pending, replyText, onChunk, onTitleUpdated } = params;
  await assertSessionAccess(userId, chatSessionId);

  const userMessage = await prisma.message.create({
    data: { chatSessionId, role: 'USER', content: replyText },
  });

  const agentSource: AgentSource = params.agentSource ?? 'chat';

  const outcome = await executeIntegrationTool({
    userId,
    tool: pending.tool,
    args: pending.args,
    source: agentSource,
    confirmed: true,
    chatSessionId,
  });

  let assistantText: string;
  if (!outcome.success) {
    assistantText = `Could not complete the action: ${outcome.error ?? 'unknown error'}`;
  } else if (pending.tool === 'whatsapp.send_message') {
    const sent = outcome.result as { to?: string; sent?: boolean } | undefined;
    const to = sent?.to ?? String(pending.args.to ?? 'contact');
    assistantText = sent?.sent === false ? `Could not send to ${to}.` : `Message sent to ${to}.`;
  } else {
    assistantText =
      typeof outcome.result === 'string'
        ? outcome.result
        : 'Action completed successfully.';
  }

  await onChunk(assistantText, chatSessionId);

  const assistantMessage = await prisma.message.create({
    data: {
      chatSessionId,
      role: 'ASSISTANT',
      content: assistantText,
    },
  });

  await prisma.chatSession.update({
    where: { id: chatSessionId },
    data: { updatedAt: new Date() },
  });

  ingestConversationMemory(userId, pending.originalText, assistantText).catch((err) => {
    console.error('[memory] ingest failed:', err instanceof Error ? err.message : err);
  });

  void maybeAutoTitleSession({
    userId,
    sessionId: chatSessionId,
    userMessage: pending.originalText,
    assistantMessage: assistantText,
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
