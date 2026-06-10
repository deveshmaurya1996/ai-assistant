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
    'search_email',
    'reply_email',
    'compose_draft',
    'mark_starred',
    'cancel_event',
    'list_upcoming',
    'create_event',
    'search_file',
    'search_drive',
    'read_drive_file',
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
      search_email: 'email.search',
      reply_email: 'email.reply_email',
      compose_draft: 'email.compose_draft',
      mark_starred: 'email.mark_starred',
      cancel_event: 'calendar.cancel_event',
      list_upcoming: 'calendar.list_upcoming',
      create_event: 'calendar.create_event',
      search_file: 'drive.search',
      search_drive: 'drive.search',
      read_drive_file: 'drive.get_content',
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
