import { capabilityFromLegacyTool } from '@ai-assistant/capabilities';
import type { ToolSource } from '@ai-assistant/types';
import {
  executeGatewayTool,
  executeWhatsAppDirect,
  type ToolExecutionOutcome,
} from '../integrations';
import { capabilityRuntimeFetch, toolRuntimeFetch } from '../lib/runtime-clients';
import {
  extractContactHintFromQuery,
  isEmailSendQuery,
  isPlaceholderRecipient,
  resolveRecipientCandidate,
} from '../whatsapp/recipient-hint';

export type { ToolExecutionOutcome };

const WHATSAPP_POLL_MS = 120_000;
const GENERIC_POLL_MS = 60_000;

export type PreparedWhatsAppSend = {
  args: { to: string; message: string };
  displayTo: string;
};

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

export async function resolveWhatsAppRecipientJid(
  userId: string,
  to: string,
  originalText?: string,
  connectionId?: string
): Promise<string> {
  const candidate = resolveRecipientCandidate(to, originalText).trim();
  if (isPlaceholderRecipient(candidate)) {
    throw new Error(
      'Could not figure out who to message. Say the contact name or phone number, e.g. "send msg to ...".'
    );
  }
  if (candidate.includes('@')) return candidate;

  const digits = candidate.replace(/\D/g, '');
  if (digits.length >= 10) return candidate;

  const outcome = await executeWhatsAppDirect({
    userId,
    tool: 'whatsapp.search_chats',
    args: { query: candidate },
    connectionId,
  });

  if (!outcome.success) {
    throw new Error(
      outcome.error ??
        `Could not find WhatsApp contact "${candidate}". Try a phone number or a name from your chats.`
    );
  }

  const chats =
    (outcome.result as { chats?: Array<{ jid?: string }> } | undefined)?.chats ?? [];
  const jid = chats[0]?.jid;
  if (!jid) {
    throw new Error(
      `Could not find WhatsApp contact "${candidate}". Try a phone number or a name from your chats.`
    );
  }
  return jid;
}

function normalizeWhatsAppMessageBody(message: string, originalText: string): string {
  const msg = message.trim();
  const query = originalText.trim();
  if (!msg || !query) return msg;

  const saying = query.match(/\b(?:saying|with)\s+(.+)$/i);
  if (saying?.[1]?.trim()) return saying[1].trim();

  const colon = query.match(/[:,-]\s*(.+)$/);
  if (colon?.[1]?.trim()) return colon[1].trim();

  if (msg !== query && !msg.toLowerCase().startsWith('send ')) {
    return msg;
  }

  const contact = extractContactHintFromQuery(query);
  if (!contact) return msg;

  const stripped = query
    .replace(new RegExp(`\\b${contact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), ' ')
    .replace(/^send(?:\s+a)?(?:\s+whatsapp)?(?:\s+message)?(?:\s+to)?\s*/i, '')
    .replace(/^(?:message|text)\s+/i, '')
    .trim();
  return stripped.length >= 1 ? stripped : msg;
}

export async function prepareWhatsAppSendArgs(
  userId: string,
  args: Record<string, unknown>,
  originalText: string,
  connectionId?: string
): Promise<PreparedWhatsAppSend> {
  if (isEmailSendQuery(originalText)) {
    throw new Error(
      'That looks like an email request, not a WhatsApp message. Try "send an email to address@example.com".'
    );
  }
  const contactHint = resolveRecipientCandidate(String(args.to ?? ''), originalText);
  const message = normalizeWhatsAppMessageBody(String(args.message ?? ''), originalText);
  const jid = await resolveWhatsAppRecipientJid(userId, contactHint, originalText, connectionId);
  const displayTo = isPlaceholderRecipient(contactHint)
    ? extractContactHintFromQuery(originalText) ?? contactHint
    : contactHint;

  return {
    args: { to: jid, message },
    displayTo: displayTo.trim() || jid.split('@')[0] || jid,
  };
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

  const res = await capabilityRuntimeFetch('/v1/execute', {
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
  originalText?: string;
}): Promise<ToolExecutionOutcome> {
  let args = { ...params.args };

  if (params.tool === 'whatsapp.send_message' && typeof args.to === 'string') {
    const to = String(args.to);
    if (!to.includes('@')) {
      try {
        args = {
          ...args,
          to: await resolveWhatsAppRecipientJid(
            params.userId,
            to,
            params.originalText,
            params.connectionId
          ),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not resolve WhatsApp recipient';
        return { success: false, tool: params.tool, error: msg };
      }
    }
  }

  const gatewayOutcome = await executeGatewayTool({
    userId: params.userId,
    tool: params.tool,
    args,
    connectionId: params.connectionId,
  });
  if (gatewayOutcome) {
    return gatewayOutcome;
  }

  return executeViaSkillRuntime({ ...params, args });
}

export function formatConfirmedActionResult(
  tool: string,
  outcome: ToolExecutionOutcome,
  pending: { args: Record<string, unknown>; displayTo?: string }
): string {
  if (!outcome.success) {
    const err = outcome.error ?? 'Something went wrong';
    if (tool === 'whatsapp.send_message') return `Could not send WhatsApp message: ${err}`;
    if (tool === 'gmail.send' || tool === 'email.send_email') return `Could not send email: ${err}`;
    return `Could not complete the action: ${err}`;
  }

  if (tool === 'whatsapp.send_message') {
    const to = pending.displayTo ?? pending.args.to ?? 'recipient';
    return `Message sent to ${to}.`;
  }
  if (tool === 'gmail.send' || tool === 'email.send_email') {
    const to = String(pending.args.to ?? 'recipient');
    return `Email sent to ${to}.`;
  }

  return typeof outcome.result === 'string' ? outcome.result : 'Action completed successfully.';
}
