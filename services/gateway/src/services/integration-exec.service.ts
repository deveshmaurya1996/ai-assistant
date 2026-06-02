import { capabilityFromLegacyTool } from '@ai-assistant/capabilities';
import type { ToolSource } from '@ai-assistant/types';
import { sessionManager } from '../whatsapp/session-manager';
import { resolveBridgeSessionForUser } from '../whatsapp/session-resolve';
import { skillRuntimeFetch, toolRuntimeFetch } from '../lib/runtime-clients';

export type ToolExecutionOutcome = {
  success: boolean;
  tool: string;
  result?: unknown;
  error?: string;
};

const WHATSAPP_OP_TIMEOUT_MS = Number(process.env.WHATSAPP_OP_TIMEOUT_MS ?? 90_000);
const WHATSAPP_POLL_MS = 120_000;
const GENERIC_POLL_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function pollExecution(
  executionId: string,
  timeoutMs = GENERIC_POLL_MS
): Promise<ToolExecutionOutcome> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'pending';

  while (Date.now() < deadline) {
    const res = await toolRuntimeFetch(`/v1/executions/${executionId}`);
    if (!res.ok) {
      if (res.status === 404) {
        return {
          success: false,
          tool: '',
          error: 'Execution not found (tool-runtime may have restarted). Retry the action.',
        };
      }
      return { success: false, tool: '', error: await res.text() };
    }
    const data = (await res.json()) as {
      status?: string;
      tool?: string;
      result?: unknown;
      error?: string;
    };
    lastStatus = data.status ?? lastStatus;

    if (data.status === 'completed') {
      return { success: true, tool: data.tool ?? '', result: data.result };
    }
    if (data.status === 'failed' || data.status === 'cancelled') {
      return {
        success: false,
        tool: data.tool ?? '',
        error: data.error ?? `Execution ${data.status}`,
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    success: false,
    tool: '',
    error: `Execution timed out (last status: ${lastStatus}). If this was WhatsApp, ensure the gateway is running and your phone is online.`,
  };
}

/** In-process WhatsApp — uses gateway Baileys + correct auth directory. */
async function executeWhatsAppDirect(params: {
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  connectionId?: string;
}): Promise<ToolExecutionOutcome> {
  const resolved = await resolveBridgeSessionForUser(params.userId, params.connectionId);
  if (!resolved) {
    return {
      success: false,
      tool: params.tool,
      error:
        'WhatsApp is not connected or the session could not be restored. Open Connect Apps, link WhatsApp, and wait until it shows Active.',
    };
  }

  const { sessionId, connectionId } = resolved;

  try {
    return await withTimeout(
      (async (): Promise<ToolExecutionOutcome> => {
        switch (params.tool) {
          case 'whatsapp.search_chats': {
            const query = String(params.args.query ?? '');
            const { chats } = await sessionManager.searchChats(sessionId, query);
            return { success: true, tool: params.tool, result: { chats } };
          }
          case 'whatsapp.send_message': {
            const message = String(params.args.message ?? '').trim();
            let to = String(params.args.to ?? '').trim();
            if (!message) {
              return { success: false, tool: params.tool, error: 'message is required' };
            }
            if (!to.includes('@') && to.replace(/\D/g, '').length < 10) {
              const { chats } = await sessionManager.searchChats(sessionId, to);
              const jid = chats[0]?.jid;
              if (!jid) {
                return {
                  success: false,
                  tool: params.tool,
                  error: `Could not find WhatsApp contact "${to}". Try a phone number (e.g. +1…) or a name from your chats.`,
                };
              }
              to = jid;
            }
            const sent = await sessionManager.sendMessage(sessionId, to, message);
            return { success: true, tool: params.tool, result: { ...sent, connectionId } };
          }
          case 'whatsapp.list_unread': {
            const limit = Number(params.args.limit ?? 20);
            const result = await sessionManager.listUnread(sessionId, limit);
            return { success: true, tool: params.tool, result };
          }
          case 'whatsapp.read_chat': {
            const chatId = String(params.args.chatId ?? params.args.jid ?? '');
            const limit = Number(params.args.limit ?? 25);
            const result = await sessionManager.readChat(sessionId, chatId, limit);
            return { success: true, tool: params.tool, result };
          }
          default:
            return {
              success: false,
              tool: params.tool,
              error: `Unsupported WhatsApp tool: ${params.tool}`,
            };
        }
      })(),
      WHATSAPP_OP_TIMEOUT_MS,
      params.tool
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'WhatsApp action failed';
    const hint =
      msg.toLowerCase().includes('timed out') || msg.toLowerCase().includes('timeout')
        ? ' Ensure your phone has internet and WhatsApp is open, then try again.'
        : '';
    return {
      success: false,
      tool: params.tool,
      error: msg + hint,
    };
  }
}

/** Resolve a name to WhatsApp JID (direct session manager). */
export async function resolveWhatsAppRecipient(
  userId: string,
  to: string,
  connectionId?: string,
  _chatSessionId?: string
): Promise<string> {
  const trimmed = to.trim();
  if (trimmed.includes('@')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 10) return trimmed;

  const outcome = await executeWhatsAppDirect({
    userId,
    tool: 'whatsapp.search_chats',
    args: { query: trimmed },
    connectionId,
  });

  if (!outcome.success || !outcome.result) return trimmed;

  const chats = (outcome.result as { chats?: Array<{ jid?: string }> }).chats ?? [];
  return chats[0]?.jid ?? trimmed;
}

async function executeViaSkillRuntime(params: {
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  source: ToolSource;
  confirmed: boolean;
  connectionId?: string;
  chatSessionId?: string;
}): Promise<ToolExecutionOutcome> {
  const capability = capabilityFromLegacyTool(params.tool);

  const res = await skillRuntimeFetch('/v1/execute', {
    method: 'POST',
    body: JSON.stringify({
      userId: params.userId,
      capability: capability?.id,
      tool: params.tool,
      args: params.args,
      source: params.source,
      confirmed: params.confirmed,
      connectionId: params.connectionId,
      chatSessionId: params.chatSessionId,
    }),
  });

  if (res.status === 428) {
    return { success: false, tool: params.tool, error: 'Confirmation required' };
  }

  if (!res.ok) {
    return { success: false, tool: params.tool, error: await res.text() };
  }

  const data = (await res.json()) as { executionId?: string; result?: unknown };
  if (!data.executionId) {
    return { success: true, tool: params.tool, result: data.result ?? data };
  }

  const timeout = params.tool.startsWith('whatsapp.') ? WHATSAPP_POLL_MS : GENERIC_POLL_MS;
  return pollExecution(data.executionId, timeout);
}

export async function executeIntegrationTool(params: {
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  source: ToolSource;
  confirmed: boolean;
  connectionId?: string;
  chatSessionId?: string;
}): Promise<ToolExecutionOutcome> {
  let args = { ...params.args };

  if (params.tool === 'whatsapp.send_message' && typeof args.to === 'string') {
    const to = String(args.to);
    if (!to.includes('@')) {
      args = {
        ...args,
        to: await resolveWhatsAppRecipient(
          params.userId,
          to,
          params.connectionId,
          params.chatSessionId
        ),
      };
    }
  }

  if (params.tool.startsWith('whatsapp.')) {
    return executeWhatsAppDirect({
      userId: params.userId,
      tool: params.tool,
      args,
      connectionId: params.connectionId,
    });
  }

  return executeViaSkillRuntime(params);
}
