import type {
  Capability,
  ConnectChallenge,
  ConnectionMeta,
  ExecutionContext,
  IntegrationConnector,
  JsonObject,
  ToolResult,
} from './types';
import { whatsAppAdapter } from './adapters/whatsapp.adapter';

export const WHATSAPP_TOOL_NAMESPACES = ['whatsapp'] as const;

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
    ctx: ExecutionContext,
    _credentials: JsonObject
  ): Promise<ToolResult> {
    const adapterCtx = {
      ...ctx,
      connectionId: bridgeSessionId,
      bridgeSessionId,
    };

    switch (tool) {
      case 'whatsapp.list_unread':
        return whatsAppAdapter.execute('list_unread', args, adapterCtx);
      case 'whatsapp.read_chat':
        return whatsAppAdapter.execute('read_chat', args, adapterCtx);
      case 'whatsapp.send_message':
        return whatsAppAdapter.execute('send_message', args, adapterCtx);
      case 'whatsapp.search_chats':
        return whatsAppAdapter.execute('search_chats', args, adapterCtx);
      default:
        return { success: false, error: `Unknown WhatsApp tool: ${tool}` };
    }
  }
}
