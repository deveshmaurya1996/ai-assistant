import type {
  Capability,
  ConnectChallenge,
  ConnectionMeta,
  ExecutionContext,
  IntegrationConnector,
  JsonObject,
  ToolResult,
} from './types';
import { whatsappBridgeRequest } from './whatsapp-bridge';

export const WHATSAPP_TOOL_NAMESPACES = ['whatsapp'] as const;

async function executeWhatsAppAction(
  sessionId: string,
  action: string,
  args: JsonObject
): Promise<ToolResult> {
  const base = `/v1/sessions/${encodeURIComponent(sessionId)}`;

  switch (action) {
    case 'list_unread': {
      const limit = Number(args.limit ?? 20);
      const res = await whatsappBridgeRequest(`${base}/unread?limit=${limit}`);
      if (!res.ok) return { success: false, error: await res.text() };
      return { success: true, data: await res.json() };
    }
    case 'read_chat': {
      const chatId = String(args.chatId ?? args.jid ?? '');
      if (!chatId) return { success: false, error: 'chatId is required' };
      const limit = Number(args.limit ?? 25);
      const res = await whatsappBridgeRequest(
        `${base}/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`
      );
      if (!res.ok) return { success: false, error: await res.text() };
      return { success: true, data: await res.json() };
    }
    case 'send_message': {
      const res = await whatsappBridgeRequest(`${base}/send`, {
        method: 'POST',
        body: JSON.stringify({ to: args.to, message: args.message }),
      });
      if (!res.ok) return { success: false, error: await res.text() };
      const data = await res.json();
      return {
        success: true,
        data: {
          type: 'messaging.send_result',
          sent: true,
          to: (data as { to?: string }).to,
          messageId: (data as { messageId?: string }).messageId,
        },
      };
    }
    case 'search_chats': {
      const res = await whatsappBridgeRequest(
        `${base}/chats?q=${encodeURIComponent(String(args.query ?? ''))}`
      );
      if (!res.ok) return { success: false, error: await res.text() };
      return { success: true, data: await res.json() };
    }
    case 'search_messages': {
      const res = await whatsappBridgeRequest(`${base}/messages/search`, {
        method: 'POST',
        body: JSON.stringify({ query: args.query, limit: args.limit }),
      });
      if (!res.ok) return { success: false, error: await res.text() };
      return { success: true, data: await res.json() };
    }
    default:
      return { success: false, error: `Unknown WhatsApp action: ${action}` };
  }
}

export class WhatsAppConnector implements IntegrationConnector {
  providerId = 'whatsapp';
  capabilities: Capability[] = ['search', 'read', 'write'];

  async getConnectUrl(_userId: string, _state: string): Promise<ConnectChallenge> {
    throw new Error(
      'WhatsApp connect is handled by the API at POST /integrations/whatsapp/connect'
    );
  }

  async handleCallback(userId: string, payload: unknown): Promise<ConnectionMeta> {
    const { sessionId, status } = payload as { sessionId: string; status?: string };
    return {
      connectionId: sessionId,
      providerId: this.providerId,
      status: status === 'active' ? 'active' : 'pending',
    };
  }

  async executeTool(
    bridgeSessionId: string,
    tool: string,
    args: JsonObject,
    _ctx: ExecutionContext,
    _credentials: JsonObject
  ): Promise<ToolResult> {
    if (!bridgeSessionId) {
      return { success: false, error: 'WhatsApp session not linked' };
    }

    const actionByTool: Record<string, string> = {
      'whatsapp.list_unread': 'list_unread',
      'whatsapp.read_chat': 'read_chat',
      'whatsapp.send_message': 'send_message',
      'whatsapp.search_chats': 'search_chats',
      'whatsapp.search_messages': 'search_messages',
    };

    const action = actionByTool[tool];
    if (!action) {
      return { success: false, error: `Unknown WhatsApp tool: ${tool}` };
    }

    return executeWhatsAppAction(bridgeSessionId, action, args);
  }
}
