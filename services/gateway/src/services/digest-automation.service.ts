import { prisma, Prisma, Role } from '@ai-assistant/database';
import { DateTime } from 'luxon';
import { resolveAssistantContext } from '@ai-assistant/types';
import { runAgentTurn } from './agent-turn.service';
import { sendPushToUser } from './push-notification.service';

type AgentDigestAction = {
  type: 'agent_digest';
  query?: string;
  pushTitle?: string;
  timezone?: string;
};

const DEFAULT_DIGEST_QUERY =
  'Check Gmail and WhatsApp for important unread items. ' +
  'Summarize only urgent or actionable messages. ' +
  'If nothing needs attention, say so briefly.';

function formatAutomationSessionTitle(name: string, timezone?: string): string {
  const tz = timezone?.trim() || 'UTC';
  const stamp = DateTime.now().setZone(tz).toFormat('MMM d, h:mm a');
  return `${name} · ${stamp}`;
}

async function createAutomationChatSession(
  userId: string,
  automationName: string,
  automationId: string,
  timezone?: string
): Promise<string> {
  const session = await prisma.chatSession.create({
    data: {
      userId,
      title: formatAutomationSessionTitle(automationName, timezone),
      kind: 'TEXT',
      context: {
        source: 'automation',
        automationId,
      } as Prisma.InputJsonValue,
      lastReadAt: null,
    },
  });
  return session.id;
}

export async function runInboxDigestAutomation(
  userId: string,
  action: AgentDigestAction,
  options?: { automationId?: string; automationName?: string }
): Promise<{ summary: string; sessionId: string }> {
  const automationName = options?.automationName?.trim() || action.pushTitle?.trim() || 'Inbox digest';
  const sessionId = await createAutomationChatSession(
    userId,
    automationName,
    options?.automationId ?? 'unknown',
    action.timezone
  );
  const assistantContext = resolveAssistantContext('assistant');
  const query = action.query?.trim() || DEFAULT_DIGEST_QUERY;

  const result = await runAgentTurn(
    {
      userId,
      query,
      routingQuery: query.slice(0, 512),
      chatSessionId: sessionId,
      chatHistory: [],
      ragEnabled: false,
      confirmed: true,
      source: 'automation',
      personalityId: assistantContext.personalityId,
      assistantDisplayName: assistantContext.displayName,
      systemPrompt: assistantContext.systemPrompt,
      timezone: action.timezone,
    },
    {
      onToken: () => {},
    }
  );

  const summary = result.fullText.trim() || 'No important inbox items right now.';

  await prisma.message.create({
    data: {
      chatSessionId: sessionId,
      role: Role.USER,
      content: query,
    },
  });
  await prisma.message.create({
    data: {
      chatSessionId: sessionId,
      role: Role.ASSISTANT,
      content: summary,
      metadata: {
        personalityId: assistantContext.personalityId,
        assistantDisplayName: assistantContext.displayName,
        source: 'inbox_digest',
        automationId: options?.automationId ?? null,
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });

  return { summary, sessionId };
}

export async function fireInboxDigestAutomation(
  automationId: string,
  userId: string,
  action: AgentDigestAction,
  automationName?: string
): Promise<string> {
  const { summary, sessionId } = await runInboxDigestAutomation(userId, action, {
    automationId,
    automationName,
  });
  const title = action.pushTitle?.trim() || automationName?.trim() || 'Inbox digest';
  const body =
    summary.length > 280 ? `${summary.slice(0, 277)}…` : summary;

  await sendPushToUser({
    userId,
    title,
    body,
    data: { type: 'inbox_digest', automationId, sessionId },
  });

  return summary;
}
