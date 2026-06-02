import { whatsappBridgeRequest } from '../whatsapp-bridge';
import type { JsonObject, ToolResult } from '../types';
import type { AdapterContext, ToolAdapter } from './types';

export class WhatsAppAdapter implements ToolAdapter {
  readonly providerId = 'whatsapp';
  readonly supportedActions = [
    'list_unread',
    'read_chat',
    'send_message',
    'search_chats',
    'send_media',
  ];

  async execute(action: string, args: JsonObject, ctx: AdapterContext): Promise<ToolResult> {
    const sessionId = ctx.bridgeSessionId ?? ctx.connectionId;
    if (!sessionId) {
      return { success: false, error: 'WhatsApp session not linked' };
    }

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
      default:
        return { success: false, error: `Unknown WhatsApp action: ${action}` };
    }
  }
}

export const whatsAppAdapter = new WhatsAppAdapter();
