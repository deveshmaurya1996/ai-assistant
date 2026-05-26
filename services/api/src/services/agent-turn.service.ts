import { orchestratorFetch } from '../lib/runtime-clients';
import {
  parseSseBuffer,
  type ChatErrorPayload,
  type ChatTokenPayload,
} from '../lib/sse';

export type AgentSource = 'chat' | 'voice' | 'automation' | 'workflow' | 'manual';

export type AgentTurnInput = {
  userId: string;
  query: string;
  chatSessionId: string;
  chatHistory: Array<{ role: string; content: string }>;
  ragEnabled: boolean;
  preferredModel: string;
  confirmed: boolean;
  source: AgentSource;
};

export type ActionConfirmPayload = {
  tool: string;
  args: Record<string, unknown>;
  executionId?: string;
};

export async function runAgentTurn(
  input: AgentTurnInput,
  callbacks: {
    onToken: (token: string) => void | Promise<void>;
    onActionConfirmRequired?: (payload: ActionConfirmPayload) => void;
  }
): Promise<{
  requiresConfirmation: boolean;
  fullText: string;
  confirmPayload?: ActionConfirmPayload;
  inlineConfirm?: boolean;
  modalConfirm?: boolean;
}> {
  const orchRes = await orchestratorFetch('/v1/agent/turn', {
    method: 'POST',
    body: JSON.stringify({
      query: input.query,
      user_id: input.userId,
      chat_history: input.chatHistory,
      chat_session_id: input.chatSessionId,
      source: input.source,
      rag_enabled: input.ragEnabled,
      preferred_model: input.preferredModel,
      confirmed: input.confirmed,
    }),
  });

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
        const payload = safeParseJson<ChatTokenPayload>(ev.data, { content: '' });
        if (payload.content) {
          accumulated += payload.content;
          await callbacks.onToken(payload.content);
        }
      } else if (ev.event === 'error') {
        const payload = safeParseJson<ChatErrorPayload>(ev.data, { message: 'Stream error' });
        const message = payload.message ?? 'Stream error';
        accumulated += `\n[${message}]\n`;
        await callbacks.onToken(`\n[${message}]\n`);
      }
    }
  }

  if (sseBuffer.trim()) {
    const { events } = parseSseBuffer(`${sseBuffer}\n\n`);
    for (const ev of events) {
      if (ev.event === 'token') {
        const payload = safeParseJson<ChatTokenPayload>(ev.data, { content: '' });
        if (payload.content) {
          accumulated += payload.content;
          await callbacks.onToken(payload.content);
        }
      }
    }
  }

  return { requiresConfirmation: false, fullText: accumulated };
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

