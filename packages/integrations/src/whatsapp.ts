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
    switch (tool) {
      case 'whatsapp.send_message': {
        const res = await whatsappBridgeRequest(
          `/v1/sessions/${encodeURIComponent(bridgeSessionId)}/send`,
          {
            method: 'POST',
            body: JSON.stringify({ to: args.to, message: args.message }),
          }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        return { success: true, data: await res.json() };
      }
      case 'whatsapp.search_chats': {
        const res = await whatsappBridgeRequest(
          `/v1/sessions/${encodeURIComponent(bridgeSessionId)}/chats?q=${encodeURIComponent(String(args.query))}`
        );
        if (!res.ok) return { success: false, error: await res.text() };
        return { success: true, data: await res.json() };
      }
      default:
        return { success: false, error: `Unknown WhatsApp tool: ${tool}` };
    }
  }
}
