import { capabilityFromLegacyTool } from '@ai-assistant/capabilities';
import type { ToolSource } from '@ai-assistant/types';
import {
  executeGatewayTool,
  executeWhatsAppDirect,
  type ToolExecutionOutcome,
} from '../integrations';
import { capabilityRuntimeFetch, toolRuntimeFetch } from '../lib/runtime-clients';

export type { ToolExecutionOutcome };

const WHATSAPP_POLL_MS = 120_000;
const GENERIC_POLL_MS = 60_000;

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

  if (!outcome.success) {
    throw new Error(
      outcome.error ??
        `Could not find WhatsApp contact "${trimmed}". Try a phone number (e.g. +1…) or a name from your chats.`
    );
  }

  const chats = (outcome.result as { chats?: Array<{ jid?: string }> } | undefined)?.chats ?? [];
  const jid = chats[0]?.jid;
  if (!jid) {
    throw new Error(
      `Could not find WhatsApp contact "${trimmed}". Try a phone number (e.g. +1…) or a name from your chats.`
    );
  }
  return jid;
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
}): Promise<ToolExecutionOutcome> {
  let args = { ...params.args };

  if (params.tool === 'whatsapp.send_message' && typeof args.to === 'string') {
    const to = String(args.to);
    if (!to.includes('@')) {
      try {
        args = {
          ...args,
          to: await resolveWhatsAppRecipient(
            params.userId,
            to,
            params.connectionId,
            params.chatSessionId
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

  return executeViaSkillRuntime(params);
}
