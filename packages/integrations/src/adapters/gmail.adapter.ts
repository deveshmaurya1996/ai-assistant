import type { JsonObject, ToolResult } from '../types';
import { GoogleConnector } from '../google';
import type { AdapterContext, ToolAdapter } from './types';

const googleConnector = new GoogleConnector();

export class GmailAdapter implements ToolAdapter {
  readonly providerId = 'google';
  readonly supportedActions = [
    'list_unread',
    'read_email',
    'send_email',
    'draft_reply',
    'list_upcoming',
    'create_event',
    'search_file',
    'search',
    'send',
  ];

  async execute(action: string, args: JsonObject, ctx: AdapterContext): Promise<ToolResult> {
    const credentials = ctx.credentials ?? {};
    const connectionId = ctx.connectionId;

    const toolMap: Record<string, string> = {
      list_unread: 'email.list_unread',
      read_email: 'email.read_email',
      send_email: 'email.send_email',
      draft_reply: 'email.draft_reply',
      list_upcoming: 'calendar.list_upcoming',
      create_event: 'calendar.create_event',
      search_file: 'files.search_documents',
      search: 'gmail.search',
      send: 'gmail.send',
    };

    const tool = toolMap[action];
    if (!tool) {
      return { success: false, error: `Unknown Google action: ${action}` };
    }

    return googleConnector.executeTool(connectionId, tool, args, ctx, credentials);
  }
}

export const gmailAdapter = new GmailAdapter();
