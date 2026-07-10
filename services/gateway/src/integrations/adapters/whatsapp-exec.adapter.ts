import { searchMessages } from '@ai-assistant/platform';
import { sessionManager } from '../../whatsapp/session-manager';
import { resolveBridgeSessionForUser } from '../../whatsapp/session-resolve';
import { formatWhatsAppUserError } from '../../whatsapp/baileys-connection';
import type { GatewayExecAdapter, GatewayExecContext, ToolExecutionOutcome } from '../types';
import { registerGatewayExecAdapter } from '../exec-registry';

const WHATSAPP_OP_TIMEOUT_MS = Number(process.env.WHATSAPP_OP_TIMEOUT_MS ?? 90_000);
const WHATSAPP_SOCKET_WAIT_MS = Number(process.env.WHATSAPP_SOCKET_WAIT_MS ?? 15_000);

type WhatsAppErrorCode = 'NOT_CONNECTED' | 'OFFLINE' | 'SYNCING';

function whatsAppError(
  tool: string,
  code: WhatsAppErrorCode,
  message: string
): ToolExecutionOutcome {
  return { success: false, tool, error: `[${code}] ${message}` };
}

function parseWhatsAppErrorCode(error: string): WhatsAppErrorCode | null {
  const match = error.match(/^\[(NOT_CONNECTED|OFFLINE|SYNCING)\]/);
  return match ? (match[1] as WhatsAppErrorCode) : null;
}

async function waitForOpenSocket(sessionId: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (sessionManager.getConnectionPhase(sessionId) === 'open') {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return sessionManager.getConnectionPhase(sessionId) === 'open';
}

async function ensureWhatsAppSocketReady(
  sessionId: string,
  tool: string
): Promise<ToolExecutionOutcome | null> {
  const bootstrapped = await sessionManager.bootstrapActiveSession(sessionId);
  if (!bootstrapped) {
    return whatsAppError(
      tool,
      'OFFLINE',
      'WhatsApp session is offline. Open Connect Apps and reconnect — ensure your phone is online.'
    );
  }

  const open = await waitForOpenSocket(sessionId, WHATSAPP_SOCKET_WAIT_MS);
  if (!open) {
    return whatsAppError(
      tool,
      'OFFLINE',
      'WhatsApp is still connecting. Wait a few seconds and try again.'
    );
  }

  return null;
}

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
  const { sessionId, connectionId, tool, args, userId } = params;

  switch (tool) {
    case 'whatsapp.search_chats': {
      const query = String(args.query ?? '');
      const { chats } = await sessionManager.searchChats(sessionId, query);
      return { success: true, tool, result: { chats } };
    }
    case 'whatsapp.send_message': {
      const message = String(args.message ?? '').trim();
      const to = String(args.to ?? '').trim();
      if (!message) {
        return { success: false, tool, error: 'message is required' };
      }
      if (!to) {
        return { success: false, tool, error: 'to is required' };
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
      const chatId = String(args.chatId ?? args.jid ?? args.query ?? '').trim();
      if (!chatId) {
        return { success: false, tool, error: 'chatId or contact name is required' };
      }
      const limit = Number(args.limit ?? 25);
      const result = await sessionManager.readChat(sessionId, chatId, limit);
      return { success: true, tool, result };
    }
    case 'whatsapp.search_messages': {
      const query = String(args.query ?? '').trim();
      const limit = Number(args.limit ?? 20);
      const sender = args.sender ? String(args.sender) : undefined;
      const result = await searchMessages(params.userId, {
        keywords: query || undefined,
        sender,
        limit,
      });
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
    return whatsAppError(
      params.tool,
      'NOT_CONNECTED',
      'WhatsApp is not connected. Open Connect Apps and link WhatsApp before I can access it.'
    );
  }

  const socketCheck = await ensureWhatsAppSocketReady(resolved.sessionId, params.tool);
  if (socketCheck) {
    return socketCheck;
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
    const raw = err instanceof Error ? err.message : 'WhatsApp action failed';
    if (
      raw.toLowerCase().includes('not synced') ||
      raw.toLowerCase().includes('have not synced') ||
      raw.toLowerCase().includes('syncing')
    ) {
      return whatsAppError(
        params.tool,
        'SYNCING',
        'WhatsApp is linked but chats are still syncing. Keep your phone online, open WhatsApp, wait a few seconds, and try again.'
      );
    }
    const msg = formatWhatsAppUserError(raw);
    const code: WhatsAppErrorCode =
      msg.toLowerCase().includes('not active') || msg.toLowerCase().includes('link whatsapp')
        ? 'NOT_CONNECTED'
        : 'OFFLINE';
    const hint =
      code === 'OFFLINE' &&
      !msg.toLowerCase().includes('timed out') &&
      !msg.toLowerCase().includes('try again')
        ? ' Ensure your phone has internet and WhatsApp is open, then try again.'
        : '';
    return whatsAppError(params.tool, code, msg + hint);
  }
}

export { parseWhatsAppErrorCode };

const whatsappExecAdapter: GatewayExecAdapter = {
  providerId: 'whatsapp',
  supportsTool: (tool) => tool.startsWith('whatsapp.'),
  execute: executeWhatsAppDirect,
};

export function registerWhatsAppExecAdapter(): void {
  registerGatewayExecAdapter(whatsappExecAdapter);
}
