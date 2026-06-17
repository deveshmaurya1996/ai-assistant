import {
  buildDefaultAttachmentQuery,
  resolveAssistantContext,
  normalizePersonalityId,
  getVoiceProfile,
  type ChatAttachmentRef,
} from '@ai-assistant/types';
import { chatHistoryLimit, loadRecentChatHistory, toAiRole } from './chat-history.service';
import { findLatestAssistantImageAttachment } from './chat-image-context.service';
import { resolveAttachments } from './file-resolver.service';
import { looksLikeImageEditFollowUp } from './image-intent.service';
import { capAttachmentUserQuery, routingQueryFromText } from './prompt-budget';
import type { AgentSource, AgentTurnInput } from './agent-turn.service';
import {
  buildRetrievalContextForAttachments,
  shouldBuildRetrievalContext,
} from './file-resolver.service';
import { buildSessionWorkingContext } from './session-context.service';
import {
  loadVoiceSessionContext,
  trimVoiceChatHistory,
  voiceSummaryPrefix,
} from './voice-summary.service';
import {
  getSessionModelAssignment,
  type SessionModelAssignment,
} from './session-model-context.service';

export type BuildAgentTurnInputParams = {
  userId: string;
  sessionId: string;
  text: string;
  attachments?: ChatAttachmentRef[];
  ragEnabled: boolean;
  confirmed: boolean;
  source: AgentSource;
  personalityId?: string;
  assistantDisplayName?: string;
  timezone?: string;
  preferredModelId?: string;
  modelAssignment?: SessionModelAssignment;
  voiceProfileId?: string;
  voiceMaxSentences?: number;
};

export async function buildAgentTurnInput(
  params: BuildAgentTurnInputParams
): Promise<AgentTurnInput> {
  let attachments = params.attachments ?? [];
  if (attachments.length === 0 && looksLikeImageEditFollowUp(params.text)) {
    const priorImage = await findLatestAssistantImageAttachment(params.sessionId);
    if (priorImage) {
      attachments = [priorImage];
    }
  }

  const voiceProfile = params.voiceProfileId ? getVoiceProfile(params.voiceProfileId) : undefined;
  const assistantContext = resolveAssistantContext(
    normalizePersonalityId(params.personalityId ?? voiceProfile?.personalityId),
    params.assistantDisplayName
  );

  const historyTake = chatHistoryLimit();
  const dbHistory = await loadRecentChatHistory(params.sessionId, historyTake);

  const voiceCtx =
    params.source === 'voice' ? await loadVoiceSessionContext(params.sessionId) : null;
  const workingContext = await buildSessionWorkingContext(
    params.userId,
    dbHistory.map((m) => ({
      role: m.role,
      content: m.content,
      metadata: m.metadata,
    }))
  );
  const sessionContext = `${voiceSummaryPrefix(voiceCtx)}${workingContext}`.trim();

  const chatHistoryRows =
    params.source === 'voice'
      ? trimVoiceChatHistory(dbHistory)
      : dbHistory;

  const resolvedAttachments =
    attachments.length > 0
      ? await resolveAttachments(params.userId, attachments, {
          query: params.text,
          forceInline: attachments.some((a) => a.kind === 'image'),
        })
      : [];

  const rawQuery =
    params.text.trim() ||
    (attachments.length > 0 ? buildDefaultAttachmentQuery(resolvedAttachments) : '');
  const query =
    attachments.length > 0 ? capAttachmentUserQuery(rawQuery) : rawQuery;

  let fileRetrievalContext = '';
  if (
    shouldBuildRetrievalContext(attachments, resolvedAttachments, params.text)
  ) {
    fileRetrievalContext = await buildRetrievalContextForAttachments(
      params.userId,
      attachments,
      params.text,
      params.sessionId
    );
  }

  return {
    userId: params.userId,
    query,
    routingQuery: routingQueryFromText(params.text),
    chatSessionId: params.sessionId,
    chatHistory: chatHistoryRows.map((m) => ({
      role: toAiRole(m.role),
      content: m.content,
    })),
    attachments,
    resolvedAttachments,
    ragEnabled: params.ragEnabled,
    confirmed: params.confirmed,
    source: params.source,
    personalityId: assistantContext.personalityId,
    assistantDisplayName: assistantContext.displayName,
    systemPrompt: assistantContext.systemPrompt,
    fileRetrievalContext,
    sessionContext,
    timezone: params.timezone,
    preferredModelId: params.preferredModelId,
    sessionModelId: params.modelAssignment?.assignedModelId,
    modelAssignment: params.modelAssignment,
    voiceProfileId: params.voiceProfileId,
    voiceMaxSentences: params.voiceMaxSentences,
  };
}
