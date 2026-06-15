import { resolveAssistantContext, normalizePersonalityId, type ChatAttachmentRef } from '@ai-assistant/types';
import { prisma, Prisma, Role, type ChatSessionKind as PrismaChatSessionKind } from '@ai-assistant/database';
import { toChatAttachmentRef, uploadUserFile } from './file.service';
import { updateSessionFileContext } from './file-registry.service';
import {
  getSessionModelAssignment,
  persistSessionModelAssignment,
} from './session-model-context.service';
import { getUserPreferredModelId } from './user-model-preference.service';
import { deleteEpisodicMemoryForSession, ingestConversationMemory } from './memory.service';
import { buildAgentTurnInput } from './chat-turn-input';
import { chatHistoryLimit, loadRecentChatHistory } from './chat-history.service';

type ChatSessionKind = 'text' | 'voice';
import { fetchAi } from '../lib/http';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { EventNames, publishEvent } from '@ai-assistant/events';
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
const DEFAULT_VOICE_SESSION_TITLE = 'Voice Chat';

function isRagGloballyEnabled(): boolean {
  const raw = (process.env.RAG_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
}

export function resolveRagEnabled(explicit?: boolean): boolean {
  if (!isRagGloballyEnabled()) return false;
  if (explicit === false) return false;
  return true;
}

export { chatHistoryLimit, toAiRole } from './chat-history.service';

function toApiSessionKind(kind: PrismaChatSessionKind): ChatSessionKind {
  return kind === 'VOICE' ? 'voice' : 'text';
}

function toPrismaSessionKind(kind?: ChatSessionKind): PrismaChatSessionKind {
  return kind === 'voice' ? 'VOICE' : 'TEXT';
}

function computeHasUnread(
  lastReadAt: Date | null | undefined,
  latestMessageAt: Date | null | undefined
): boolean {
  if (!latestMessageAt) return false;
  if (!lastReadAt) return true;
  return latestMessageAt.getTime() > lastReadAt.getTime();
}

function serializeSession(session: {
  id: string;
  title: string | null;
  kind: PrismaChatSessionKind;
  lastReadAt?: Date | null;
  _count?: { messages: number };
  messages?: Array<{ createdAt: Date }>;
}) {
  const latestMessageAt = session.messages?.[0]?.createdAt ?? null;
  return {
    id: session.id,
    title: session.title,
    kind: toApiSessionKind(session.kind),
    messageCount: session._count?.messages ?? 0,
    hasUnread: computeHasUnread(session.lastReadAt, latestMessageAt),
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

function fallbackChatTitle(userMessage: string): string {
  const trimmed = userMessage.trim();
  if (!trimmed) return '';
  return trimmed.length > 30 ? `${trimmed.slice(0, 27)}...` : trimmed;
}

function resolveAutoTitle(
  aiTitle: string | undefined,
  userMessage: string
): string | null {
  const trimmed = aiTitle?.trim();
  if (trimmed && !isPlaceholderTitle(trimmed)) return trimmed;

  const fallback = fallbackChatTitle(userMessage);
  if (fallback && !isPlaceholderTitle(fallback)) return fallback;

  return null;
}

export async function listSessions(
  userId: string,
  options?: { cursor?: string; limit?: number; personalityId?: string }
) {
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 50);
  const where: Prisma.ChatSessionWhereInput = {
    userId,
    messages: { some: {} },
  };

  if (options?.cursor) {
    const cursorSession = await prisma.chatSession.findUnique({
      where: { id: options.cursor },
    });
    if (cursorSession && cursorSession.userId === userId) {
      where.AND = [
        {
          OR: [
            { updatedAt: { lt: cursorSession.updatedAt } },
            { updatedAt: cursorSession.updatedAt, id: { lt: cursorSession.id } },
          ],
        },
      ];
    }
  }

  const rows = await prisma.chatSession.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    sessions: page.map(serializeSession),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function updateSession(
  userId: string,
  sessionId: string,
  data: { title: string }
) {
  await assertSessionAccess(userId, sessionId);
  const title = data.title.trim();
  if (!title) throw badRequest('Title is required');
  if (title.length > 100) throw badRequest('Title must be 100 characters or fewer');

  const updated = await prisma.chatSession.update({
    where: { id: sessionId },
    data: { title },
    include: { _count: { select: { messages: true } } },
  });
  return serializeSession(updated);
}

export async function getSession(userId: string, sessionId: string) {
  const session = await assertSessionAccess(userId, sessionId);
  const latest = await prisma.message.findFirst({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return serializeSession({
    ...session,
    messages: latest ? [latest] : [],
  });
}

export async function markSessionRead(userId: string, sessionId: string) {
  await assertSessionAccess(userId, sessionId);
  const updated = await prisma.chatSession.update({
    where: { id: sessionId },
    data: { lastReadAt: new Date() },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });
  return serializeSession(updated);
}

const DEFAULT_PERSONALITY_ID = 'assistant';

function attachmentsFromMetadata(metadata: unknown): ChatAttachmentRef[] | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as { attachments?: unknown }).attachments;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw as ChatAttachmentRef[];
}

function personalityFieldsFromMetadata(metadata: unknown): {
  personalityId?: string;
  assistantDisplayName?: string;
} {
  if (!metadata || typeof metadata !== 'object') return {};
  const raw = metadata as { personalityId?: unknown; assistantDisplayName?: unknown };
  const personalityId =
    typeof raw.personalityId === 'string' ? raw.personalityId : undefined;
  const assistantDisplayName =
    typeof raw.assistantDisplayName === 'string' ? raw.assistantDisplayName : undefined;
  return { personalityId, assistantDisplayName };
}

function buildAssistantMessageMetadata(
  assistantContext: { personalityId: string; displayName: string },
  attachments?: ChatAttachmentRef[]
): Prisma.InputJsonValue {
  const meta: Record<string, unknown> = {
    personalityId: assistantContext.personalityId,
    assistantDisplayName: assistantContext.displayName,
  };
  if (attachments?.length) {
    meta.attachments = attachments;
  }
  return meta as Prisma.InputJsonValue;
}

function buildUserMessageMetadata(
  assistantContext: { personalityId: string; displayName: string },
  attachments?: ChatAttachmentRef[]
): Prisma.InputJsonValue | undefined {
  const meta: Record<string, unknown> = {
    personalityId: assistantContext.personalityId,
    assistantDisplayName: assistantContext.displayName,
  };
  if (attachments?.length) {
    meta.attachments = attachments;
  }
  return meta as Prisma.InputJsonValue;
}

export function mapApiMessage(message: {
  id: string;
  role: Role;
  content: string;
  metadata?: unknown | null;
}) {
  const personality = personalityFieldsFromMetadata(message.metadata ?? null);
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: attachmentsFromMetadata(message.metadata ?? null),
    ...personality,
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
  await deleteEpisodicMemoryForSession(userId, sessionId).catch((err) => {
    console.warn(
      '[chat] episodic cleanup failed:',
      err instanceof Error ? err.message : err
    );
  });
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

function parseSsePayload<T>(data: string, fallback: T): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

function assistantTextForTitle(assistantMessage: string, hasImageAttachment = false): string {
  const trimmed = assistantMessage.trim();
  if (trimmed) return trimmed;
  if (hasImageAttachment) {
    return 'The assistant generated an image for the user.';
  }
  return trimmed;
}

export async function maybeAutoTitleSession(params: {
  userId: string;
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  hasImageAttachment?: boolean;
  onTitleUpdated?: (sessionId: string, title: string) => void;
}): Promise<void> {
  const {
    userId,
    sessionId,
    userMessage,
    assistantMessage,
    hasImageAttachment = false,
    onTitleUpdated,
  } = params;

  try {
    const session = await assertSessionAccess(userId, sessionId);
    if (!shouldAutoTitle(session.title, userMessage)) {
      console.info('[chat] auto-title skipped: session already titled', { sessionId });
      return;
    }

    const userForTitle = userMessage.trim();
    const assistantForTitle = assistantTextForTitle(assistantMessage, hasImageAttachment);
    if (!userForTitle && !assistantForTitle) {
      console.info('[chat] auto-title skipped: empty title payload', { sessionId });
      return;
    }

    let resolvedTitle: string | null = null;
    try {
      const { title } = await fetchAi<{ title: string }>('/v1/chat/title', {
        method: 'POST',
        body: JSON.stringify({
          user_message: userForTitle || 'New conversation',
          assistant_message: assistantForTitle || 'The assistant replied.',
        }),
        signal:
          typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(20_000)
            : undefined,
      });
      resolvedTitle = resolveAutoTitle(title, userForTitle);
    } catch (err) {
      console.warn(
        '[chat] auto-title AI call failed, using fallback:',
        err instanceof Error ? err.message : err
      );
      resolvedTitle = resolveAutoTitle(undefined, userForTitle);
    }

    if (!resolvedTitle) {
      console.info('[chat] auto-title skipped: no usable title', { sessionId });
      return;
    }

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title: resolvedTitle },
    });

    onTitleUpdated?.(sessionId, resolvedTitle);
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
  timezone?: string;
  preferredModelId?: string;
  onChunk: (chunk: string, sessionId: string) => void | Promise<void>;
  onStatus?: (message: string, sessionId: string) => void | Promise<void>;
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
  const deviceTimezone = params.timezone?.trim() || undefined;
  if (text.match(/\b(remind|reminder|notify me|schedule)\b/i)) {
    console.info('[chat] reminder-related message', {
      sessionId,
      userId,
      timezone: deviceTimezone ?? '(missing)',
      textPreview: text.slice(0, 100),
    });
  }

  if (isNew) {
    onSessionCreated?.(sessionId);
    publishEvent(EventNames.CHAT_STARTED, {
      userId,
      sessionId,
      source,
    }).catch(() => undefined);
  }

  const assistantContext = resolveAssistantContext(
    normalizePersonalityId(params.personalityId),
    params.assistantDisplayName
  );

  const userMessage = await prisma.message.create({
    data: {
      chatSessionId: sessionId,
      role: 'USER',
      content: text,
      metadata: buildUserMessageMetadata(assistantContext, attachments),
    },
  });

  const agentSource: AgentSource =
    params.agentSource ?? (source === 'socket' ? 'chat' : 'chat');

  if (attachments.length > 0) {
    await updateSessionFileContext(sessionId, {
      lastReferencedFileIds: attachments.map((a) => a.id),
    });
    console.info('[chat] processing message with attachments', {
      sessionId,
      attachmentCount: attachments.length,
      kinds: attachments.map((a) => a.kind),
    });
  }

  const turnInput = await buildAgentTurnInput({
    userId,
    sessionId,
    text,
    attachments,
    ragEnabled,
    confirmed: params.confirmed ?? false,
    source: agentSource,
    personalityId: params.personalityId,
    assistantDisplayName: params.assistantDisplayName,
    timezone: deviceTimezone,
    preferredModelId:
      params.preferredModelId ?? (await getUserPreferredModelId(userId)),
    modelAssignment: await getSessionModelAssignment(sessionId),
  });

  const stickyModelId = turnInput.sessionModelId;

  let turn;
  try {
    turn = await runAgentTurn(
      turnInput,
      {
        onToken: (token) => onChunk(token, sessionId),
        onStatus: (message) => params.onStatus?.(message, sessionId),
        onActionConfirmRequired: params.onActionConfirmRequired,
        onModelUsed: async (modelId, label) => {
          const taskReason = turnInput.modelAssignment?.assignedReason ?? 'fast_chat';
          await persistSessionModelAssignment(sessionId, modelId, taskReason, {
            isFailover: stickyModelId != null && stickyModelId !== modelId,
            previousModelId: stickyModelId,
          });
          params.onModelUsed?.(sessionId, modelId, label);
        },
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
          metadata: buildAssistantMessageMetadata(assistantContext),
        },
      });

      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });

      void maybeAutoTitleSession({
        userId,
        sessionId,
        userMessage: text.trim() || turnInput.query,
        assistantMessage: partial,
        onTitleUpdated,
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
          metadata: buildAssistantMessageMetadata(assistantContext),
        },
      });

      void maybeAutoTitleSession({
        userId,
        sessionId,
        userMessage: text.trim() || turnInput.query,
        assistantMessage: confirmText,
        onTitleUpdated,
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

    const modalConfirmText = 'Please confirm this action to continue.';
    const assistantMessage = await prisma.message.create({
      data: {
        chatSessionId: sessionId,
        role: 'ASSISTANT',
        content: modalConfirmText,
        metadata: buildAssistantMessageMetadata(assistantContext),
      },
    });

    void maybeAutoTitleSession({
      userId,
      sessionId,
      userMessage: text.trim() || turnInput.query,
      assistantMessage: modalConfirmText,
      onTitleUpdated,
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
  if (!accumulated.trim() && assistantAttachments.length === 0) {
    throw new AppError(
      502,
      'The assistant returned an empty response. Please try again.'
    );
  }

  const assistantMessage = await prisma.message.create({
    data: {
      chatSessionId: sessionId,
      role: 'ASSISTANT',
      content: accumulated,
      metadata: buildAssistantMessageMetadata(assistantContext, assistantAttachments),
    },
  });

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });

  ingestConversationMemory(userId, text, accumulated, sessionId).catch((err) => {
    console.error('[memory] ingest failed:', err instanceof Error ? err.message : err);
  });

  void maybeAutoTitleSession({
    userId,
    sessionId,
    userMessage: text.trim() || turnInput.query,
    assistantMessage: accumulated,
    hasImageAttachment: assistantAttachments.length > 0,
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
  const dbHistory = await loadRecentChatHistory(sessionId, chatHistoryLimit());
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
  personalityId?: string;
  assistantDisplayName?: string;
  onChunk: (chunk: string, sessionId: string) => void | Promise<void>;
  onTitleUpdated?: (sessionId: string, title: string) => void;
  signal?: AbortSignal;
}) {
  const { userId, chatSessionId, pending, replyText, onChunk, onTitleUpdated } = params;
  await assertSessionAccess(userId, chatSessionId);

  const assistantContext = resolveAssistantContext(
    normalizePersonalityId(params.personalityId),
    params.assistantDisplayName
  );

  const userMessage = await prisma.message.create({
    data: {
      chatSessionId,
      role: 'USER',
      content: replyText,
      metadata: buildUserMessageMetadata(assistantContext),
    },
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
      metadata: buildAssistantMessageMetadata(assistantContext),
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

  return {
    sessionId: chatSessionId,
    userMessage: mapApiMessage(userMessage),
    assistantMessage: mapApiMessage(assistantMessage),
  };
}

export async function processInlineConfirmCancel(params: {
  userId: string;
  chatSessionId: string;
  replyText: string;
  personalityId?: string;
  assistantDisplayName?: string;
}) {
  const { userId, chatSessionId, replyText } = params;
  await assertSessionAccess(userId, chatSessionId);

  const assistantContext = resolveAssistantContext(
    normalizePersonalityId(params.personalityId),
    params.assistantDisplayName
  );

  const userMessage = await prisma.message.create({
    data: {
      chatSessionId,
      role: 'USER',
      content: replyText,
      metadata: buildUserMessageMetadata(assistantContext),
    },
  });

  const assistantMessage = await prisma.message.create({
    data: {
      chatSessionId,
      role: 'ASSISTANT',
      content: 'Cancelled.',
      metadata: buildAssistantMessageMetadata(assistantContext),
    },
  });

  await prisma.chatSession.update({
    where: { id: chatSessionId },
    data: { updatedAt: new Date() },
  });

  return {
    sessionId: chatSessionId,
    userMessage: mapApiMessage(userMessage),
    assistantMessage: mapApiMessage(assistantMessage),
  };
}
