import type { ChatAttachmentRef, ResolvedAttachment } from '@ai-assistant/types';
import { aiClient } from '../lib/ai-client';
import {
  parseSseBuffer,
  type ChatErrorPayload,
  type ChatTokenPayload,
} from '../lib/sse';
import { ChatTurnAbortedError } from './chat-turn-errors';

export type AgentSource = 'chat' | 'voice' | 'automation' | 'workflow' | 'manual';

export type AgentTurnInput = {
  userId: string;
  query: string;
  routingQuery?: string;
  chatSessionId: string;
  chatHistory: Array<{ role: string; content: string }>;
  attachments?: ChatAttachmentRef[];
  resolvedAttachments?: ResolvedAttachment[];
  ragEnabled: boolean;
  confirmed: boolean;
  source: AgentSource;
  personalityId?: string;
  assistantDisplayName?: string;
  systemPrompt?: string;
  fileRetrievalContext?: string;
  sessionContext?: string;
  timezone?: string;
};

export type ActionConfirmPayload = {
  tool: string;
  args: Record<string, unknown>;
  executionId?: string;
};

export type AgentTurnResult = {
  requiresConfirmation: boolean;
  fullText: string;
  modelUsed?: string;
  modelLabel?: string;
  generatedAttachments?: ChatAttachmentRef[];
  confirmPayload?: ActionConfirmPayload;
  inlineConfirm?: boolean;
  modalConfirm?: boolean;
};

type DonePayload = { model?: string | null; label?: string | null };

type ImageSsePayload = {
  imageBase64?: string;
  mimeType?: string;
};

function modelLabelFromId(modelId?: string | null): string | undefined {
  if (!modelId) return undefined;
  const tail = modelId.split('/').pop() ?? modelId;
  return tail.replace(/-/g, ' ');
}

function logAttachmentTurnSummary(
  input: AgentTurnInput,
  result: { fullText: string; firstTokenMs?: number }
): void {
  const refs = input.attachments ?? [];
  if (refs.length === 0) return;

  const resolved = input.resolvedAttachments ?? [];
  const summary = {
    count: refs.length,
    kinds: refs.map((r) => r.kind),
    withImage: resolved.filter((r) => r.imageDataUrl).length,
    withExcerpt: resolved.filter((r) => r.textExcerpt).length,
    withNote: resolved.filter((r) => r.note).length,
    queryChars: input.query.length,
    routingQueryChars: (input.routingQuery ?? input.query.slice(0, 512)).length,
    fileContextChars: (input.fileRetrievalContext ?? '').length,
    firstTokenMs: result.firstTokenMs,
    responseChars: result.fullText.length,
  };

  if (!result.fullText.trim()) {
    console.warn('[chat] attachment turn finished with empty response', summary);
  } else {
    console.info('[chat] attachment turn complete', summary);
  }
}

export async function runAgentTurn(
  input: AgentTurnInput,
  callbacks: {
    onToken: (token: string) => void | Promise<void>;
    onStatus?: (message: string) => void | Promise<void>;
    onActionConfirmRequired?: (payload: ActionConfirmPayload) => void;
    onModelUsed?: (modelId: string, label?: string) => void;
    onImageGenerated?: (payload: {
      imageBase64: string;
      mimeType: string;
    }) => void | Promise<ChatAttachmentRef | void>;
  },
  options?: { signal?: AbortSignal }
): Promise<AgentTurnResult> {
  const signal = options?.signal;
  let accumulated = '';
  let modelUsed: string | undefined;
  let modelLabel: string | undefined;
  const generatedAttachments: ChatAttachmentRef[] = [];
  const turnStartedAt = Date.now();
  let firstTokenMs: number | undefined;

  let orchRes: Response;
  try {
    orchRes = await aiClient.agent.turn(
      {
        query: input.query,
        routing_query: input.routingQuery ?? input.query.slice(0, 512),
        user_id: input.userId,
        chat_history: input.chatHistory,
        chat_session_id: input.chatSessionId,
        source: input.source,
        rag_enabled: input.ragEnabled,
        confirmed: input.confirmed,
        attachments: input.attachments ?? [],
        resolved_attachments: input.resolvedAttachments ?? [],
        personality_id: input.personalityId,
        assistant_display_name: input.assistantDisplayName,
        system_prompt: input.systemPrompt,
        file_retrieval_context: input.fileRetrievalContext ?? '',
        session_context: input.sessionContext ?? '',
        timezone: input.timezone,
      },
      { signal }
    );
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new ChatTurnAbortedError(accumulated);
    }
    throw err;
  }

  if (!orchRes.ok && orchRes.status !== 428) {
    const errText = await orchRes.text();
    throw new Error(errText || `Orchestrator error (${orchRes.status})`);
  }

  const contentType = orchRes.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data = (await orchRes.json()) as {
      requiresConfirmation?: boolean;
      tools?: Array<{ tool: string; args?: Record<string, unknown>; executionId?: string }>;
    };
    if (data.requiresConfirmation && data.tools?.length) {
      const first = data.tools[0]!;
      return {
        requiresConfirmation: true,
        fullText: '',
        confirmPayload: {
          tool: first.tool,
          args: first.args ?? {},
          executionId: first.executionId,
        },
      };
    }
  }

  if (!orchRes.body) {
    throw new Error('Orchestrator returned empty response');
  }

  const reader = orchRes.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let sseBuffer = '';
  let earlyConfirm: AgentTurnResult | undefined;

  const processEvents = async (events: ReturnType<typeof parseSseBuffer>['events']) => {
    for (const ev of events) {
      if (ev.event === 'token') {
        const payload = safeParseJson<ChatTokenPayload>(ev.data, { content: '' });
        if (payload.content) {
          if (firstTokenMs === undefined) {
            firstTokenMs = Date.now() - turnStartedAt;
          }
          accumulated += payload.content;
          void callbacks.onToken(payload.content);
        }
      } else if (ev.event === 'status') {
        const payload = safeParseJson<{ message?: string }>(ev.data, {});
        if (payload.message) {
          void callbacks.onStatus?.(payload.message);
        }
      } else if (ev.event === 'provider_switch') {
        const payload = safeParseJson<{
          message?: string;
          to_provider?: string;
          to_model?: string;
        }>(ev.data, {});
        const message =
          payload.message ??
          (payload.to_provider
            ? `Switching provider (${payload.to_provider})…`
            : 'Switching provider…');
        void callbacks.onStatus?.(message);
      } else if (ev.event === 'action_confirm') {
        const payload = safeParseJson<{
          requiresConfirmation?: boolean;
          tools?: Array<{ tool: string; args?: Record<string, unknown>; executionId?: string }>;
        }>(ev.data, {});
        if (payload.requiresConfirmation && payload.tools?.length) {
          const first = payload.tools[0]!;
          earlyConfirm = {
            requiresConfirmation: true,
            fullText: accumulated,
            confirmPayload: {
              tool: first.tool,
              args: first.args ?? {},
              executionId: first.executionId,
            },
          };
        }
      } else if (ev.event === 'error') {
        const payload = safeParseJson<ChatErrorPayload>(ev.data, { message: 'Stream error' });
        const message = payload.message ?? 'Stream error';
        throw new Error(message);
      } else if (ev.event === 'image') {
        const payload = safeParseJson<ImageSsePayload>(ev.data, {});
        if (payload.imageBase64 && callbacks.onImageGenerated) {
          const ref = await callbacks.onImageGenerated({
            imageBase64: payload.imageBase64,
            mimeType: payload.mimeType ?? 'image/jpeg',
          });
          if (ref) {
            generatedAttachments.push(ref);
          }
        }
      } else if (ev.event === 'done') {
        const payload = safeParseJson<DonePayload>(ev.data, {});
        if (payload.model) {
          modelUsed = payload.model;
          modelLabel = payload.label ?? modelLabelFromId(payload.model);
          await callbacks.onModelUsed?.(payload.model, modelLabel);
        }
      }
    }
  };

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new ChatTurnAbortedError(accumulated);
    }

    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await reader.read();
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw new ChatTurnAbortedError(accumulated);
      }
      throw err;
    }

    const { done, value } = readResult;
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });

    const { events, rest } = parseSseBuffer(sseBuffer);
    sseBuffer = rest;
    await processEvents(events);
    if (earlyConfirm) return earlyConfirm;
  }

  if (sseBuffer.trim()) {
    const { events } = parseSseBuffer(`${sseBuffer}\n\n`);
    await processEvents(events);
  }

  if (earlyConfirm) return earlyConfirm;

  const result: AgentTurnResult = {
    requiresConfirmation: false,
    fullText: accumulated,
    modelUsed,
    modelLabel: modelLabel ?? (modelUsed ? modelLabelFromId(modelUsed) : undefined),
    generatedAttachments:
      generatedAttachments.length > 0 ? generatedAttachments : undefined,
  };

  logAttachmentTurnSummary(input, {
    fullText: result.fullText,
    firstTokenMs,
  });

  return result;
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
