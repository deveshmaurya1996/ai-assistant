import { sessionManager } from '../../whatsapp/session-manager';
import { resolveBridgeSessionForUser } from '../../whatsapp/session-resolve';
import type { GatewayExecAdapter, GatewayExecContext, ToolExecutionOutcome } from '../types';
import { registerGatewayExecAdapter } from '../exec-registry';

const WHATSAPP_OP_TIMEOUT_MS = Number(process.env.WHATSAPP_OP_TIMEOUT_MS ?? 90_000);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function executeWhatsAppTool(
  params: GatewayExecContext & { sessionId: string; connectionId: string }
): Promise<ToolExecutionOutcome> {
  const { sessionId, connectionId, tool, args } = params;

  switch (tool) {
    case 'whatsapp.search_chats': {
      const query = String(args.query ?? '');
      const { chats } = await sessionManager.searchChats(sessionId, query);
      return { success: true, tool, result: { chats } };
    }
    case 'whatsapp.send_message': {
      const message = String(args.message ?? '').trim();
      let to = String(args.to ?? '').trim();
      if (!message) {
        return { success: false, tool, error: 'message is required' };
      }
      if (!to.includes('@') && to.replace(/\D/g, '').length < 10) {
        const { chats } = await sessionManager.searchChats(sessionId, to);
        const jid = chats[0]?.jid;
        if (!jid) {
          return {
            success: false,
            tool,
            error: `Could not find WhatsApp contact "${to}". Try a phone number (e.g. +1…) or a name from your chats.`,
          };
        }
        to = jid;
      }
      const sent = await sessionManager.sendMessage(sessionId, to, message);
      return { success: true, tool, result: { ...sent, connectionId } };
    }
    case 'whatsapp.list_unread': {
      const limit = Number(args.limit ?? 20);
      const result = await sessionManager.listUnread(sessionId, limit);
      return { success: true, tool, result };
    }
    case 'whatsapp.read_chat': {
      const chatId = String(args.chatId ?? args.jid ?? '');
      const limit = Number(args.limit ?? 25);
      const result = await sessionManager.readChat(sessionId, chatId, limit);
      return { success: true, tool, result };
    }
    default:
      return { success: false, tool, error: `Unsupported WhatsApp tool: ${tool}` };
  }
}

export async function executeWhatsAppDirect(
  params: GatewayExecContext
): Promise<ToolExecutionOutcome> {
  const resolved = await resolveBridgeSessionForUser(params.userId, params.connectionId);
  if (!resolved) {
    return {
      success: false,
      tool: params.tool,
      error:
        'WhatsApp is not connected or the session could not be restored. Open Connect Apps, link WhatsApp, and wait until it shows Active.',
    };
  }

  try {
    return await withTimeout(
      executeWhatsAppTool({
        ...params,
        sessionId: resolved.sessionId,
        connectionId: resolved.connectionId,
      }),
      WHATSAPP_OP_TIMEOUT_MS,
      params.tool
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'WhatsApp action failed';
    const hint =
      msg.toLowerCase().includes('timed out') || msg.toLowerCase().includes('timeout')
        ? ' Ensure your phone has internet and WhatsApp is open, then try again.'
        : '';
    return { success: false, tool: params.tool, error: msg + hint };
  }
}

const whatsappExecAdapter: GatewayExecAdapter = {
  providerId: 'whatsapp',
  supportsTool: (tool) => tool.startsWith('whatsapp.'),
  execute: executeWhatsAppDirect,
};

export function registerWhatsAppExecAdapter(): void {
  registerGatewayExecAdapter(whatsappExecAdapter);
}
