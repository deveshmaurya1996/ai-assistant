import { prisma } from '@ai-assistant/database';
import type { Prisma } from '@ai-assistant/database';
import type { VoiceSessionContext } from '@ai-assistant/types';
import { fetchAi } from '../lib/http';

const SUMMARY_TURN_THRESHOLD = 12;
const VOICE_HISTORY_KEEP = 8;

export function parseVoiceSessionContext(raw: unknown): VoiceSessionContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const ctx = raw as Record<string, unknown>;
  const voice = ctx.voice;
  if (!voice || typeof voice !== 'object') return null;
  const v = voice as Record<string, unknown>;
  if (typeof v.rollingSummary !== 'string') return null;
  return {
    rollingSummary: v.rollingSummary,
    summarizedThroughMessageId: String(v.summarizedThroughMessageId ?? ''),
    turnCount: typeof v.turnCount === 'number' ? v.turnCount : 0,
    totalVoiceDurationMs:
      typeof v.totalVoiceDurationMs === 'number' ? v.totalVoiceDurationMs : 0,
  };
}

export function voiceSummaryPrefix(ctx: VoiceSessionContext | null): string {
  if (!ctx?.rollingSummary?.trim()) return '';
  return `Voice session summary (earlier conversation):\n${ctx.rollingSummary.trim()}\n\n`;
}

export function trimVoiceChatHistory<T extends { role: string; content: string }>(
  history: T[],
  keepRecent = VOICE_HISTORY_KEEP
): T[] {
  if (history.length <= keepRecent) return history;
  return history.slice(-keepRecent);
}

export async function loadVoiceSessionContext(
  sessionId: string
): Promise<VoiceSessionContext | null> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { context: true },
  });
  return parseVoiceSessionContext(session?.context);
}

export async function incrementVoiceTurnCount(sessionId: string): Promise<VoiceSessionContext> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { context: true },
  });
  const existing = parseVoiceSessionContext(session?.context) ?? {
    rollingSummary: '',
    summarizedThroughMessageId: '',
    turnCount: 0,
    totalVoiceDurationMs: 0,
  };
  const next: VoiceSessionContext = {
    ...existing,
    turnCount: existing.turnCount + 1,
  };
  const baseContext =
    session?.context && typeof session.context === 'object'
      ? (session.context as Record<string, unknown>)
      : {};
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      context: {
        ...baseContext,
        voice: next,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return next;
}

export async function maybeUpdateVoiceSessionSummary(params: {
  sessionId: string;
  userId: string;
}): Promise<void> {
  const voiceCtx = await incrementVoiceTurnCount(params.sessionId);
  if (voiceCtx.turnCount < SUMMARY_TURN_THRESHOLD) return;

  const messages = await prisma.message.findMany({
    where: { chatSessionId: params.sessionId },
    orderBy: { createdAt: 'asc' },
    take: 40,
  });

  const cutoffIndex = voiceCtx.summarizedThroughMessageId
    ? messages.findIndex((m) => m.id === voiceCtx.summarizedThroughMessageId)
    : -1;
  const unsummarized = cutoffIndex >= 0 ? messages.slice(cutoffIndex + 1) : messages;

  if (unsummarized.length < 6) return;

  const transcript = unsummarized
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
    .slice(0, 6000);

  try {
    const result = await fetchAi<{ text: string }>('/v1/chat/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `Summarize this voice conversation in 3-5 sentences for context compression. Focus on user goals, decisions, and open items.\n\n${transcript}`,
        rag_enabled: false,
        chat_history: [],
        user_id: params.userId,
        task: 'summary',
      }),
    });

    const summary = (result.text ?? '').trim();
    if (!summary) return;

    const lastMessage = unsummarized[unsummarized.length - 1];
    const session = await prisma.chatSession.findUnique({
      where: { id: params.sessionId },
      select: { context: true },
    });
    const baseContext =
      session?.context && typeof session.context === 'object'
        ? (session.context as Record<string, unknown>)
        : {};

    const updated: VoiceSessionContext = {
      rollingSummary: voiceCtx.rollingSummary
        ? `${voiceCtx.rollingSummary}\n${summary}`
        : summary,
      summarizedThroughMessageId: lastMessage?.id ?? voiceCtx.summarizedThroughMessageId,
      turnCount: voiceCtx.turnCount,
      totalVoiceDurationMs: voiceCtx.totalVoiceDurationMs,
    };

    await prisma.chatSession.update({
      where: { id: params.sessionId },
      data: {
        context: {
          ...baseContext,
          voice: updated,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.warn(
      '[voice-summary] failed:',
      err instanceof Error ? err.message : err
    );
  }
}
