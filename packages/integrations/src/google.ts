import type {
  Capability,
  ConnectChallenge,
  ConnectionMeta,
  ExecutionContext,
  HealthStatus,
  IntegrationConnector,
  JsonObject,
  SyncResult,
  ToolResult,
} from './types';
import { assertGoogleIntegrationConfigured } from './google-config';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

export const GOOGLE_TOOL_NAMESPACES = ['gmail', 'calendar', 'drive', 'email'] as const;

function decodeGmailBody(part: Record<string, unknown>): string {
  const body = part.body as { data?: string } | undefined;
  if (body?.data) {
    return Buffer.from(body.data, 'base64url').toString('utf8');
  }
  const parts = part.parts as Record<string, unknown>[] | undefined;
  if (parts) {
    for (const p of parts) {
      const mime = p.mimeType as string;
      if (mime === 'text/plain' || mime === 'text/html') {
        const text = decodeGmailBody(p);
        if (text) return text;
      }
    }
  }
  return '';
}

export class GoogleConnector implements IntegrationConnector {
  providerId = 'google';
  capabilities: Capability[] = ['search', 'read', 'write', 'schedule'];

  async getConnectUrl(userId: string, state: string): Promise<ConnectChallenge> {
    const { clientId, redirectUri } = assertGoogleIntegrationConfigured();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: `${userId}:${state}`,
    });

    return {
      type: 'oauth',
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      state,
    };
  }

  async handleCallback(userId: string, payload: unknown): Promise<ConnectionMeta> {
    const { code } = payload as { code?: string };
    if (!code) throw new Error('Missing OAuth code');

    const tokens = await this.exchangeCode(code);
    return {
      connectionId: `google_${userId}`,
      providerId: this.providerId,
      status: 'active',
      scopes: GOOGLE_SCOPES.split(' '),
      credentials: tokens,
    };
  }

  private async exchangeCode(code: string): Promise<JsonObject> {
    const { clientId, clientSecret, redirectUri } = assertGoogleIntegrationConfigured();

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      throw new Error(`Google token exchange failed: ${await res.text()}`);
    }
    return (await res.json()) as JsonObject;
  }

  async healthCheck(_connectionId: string, credentials: JsonObject): Promise<HealthStatus> {
    if (!credentials.access_token) {
      return { healthy: false, message: 'Missing access token' };
    }
    return { healthy: true };
  }

  async executeTool(
    _connectionId: string,
    tool: string,
    args: JsonObject,
    _ctx: ExecutionContext,
    credentials: JsonObject
  ): Promise<ToolResult> {
    const token = credentials.access_token as string | undefined;
    if (!token) return { success: false, error: 'Not authenticated with Google' };

    switch (tool) {
      case 'email.list_unread': {
        const maxResults = Number(args.maxResults ?? 15);
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread in:inbox')}&maxResults=${maxResults}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        const list = (await res.json()) as { messages?: { id: string }[] };
        const items: Array<{
          id: string;
          from: string;
          subject: string;
          preview: string;
          timestamp: string;
        }> = [];
        for (const ref of list.messages ?? []) {
          const detail = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!detail.ok) continue;
          const msg = (await detail.json()) as {
            id: string;
            snippet?: string;
            internalDate?: string;
            payload?: { headers?: { name: string; value: string }[] };
          };
          const headers = msg.payload?.headers ?? [];
          const from = headers.find((h) => h.name === 'From')?.value ?? '';
          const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)';
          items.push({
            id: msg.id,
            from,
            subject,
            preview: msg.snippet ?? '',
            timestamp: msg.internalDate
              ? new Date(Number(msg.internalDate)).toISOString()
              : new Date().toISOString(),
          });
        }
        return {
          success: true,
          data: {
            type: 'email.unread_list',
            items,
            totalUnread: items.length,
          },
        };
      }
      case 'email.read_email': {
        let messageId = args.messageId as string | undefined;
        if (!messageId) {
          const listRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread in:inbox')}&maxResults=1`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!listRes.ok) return { success: false, error: await listRes.text() };
          const list = (await listRes.json()) as { messages?: { id: string }[] };
          messageId = list.messages?.[0]?.id;
          if (!messageId) {
            return { success: false, error: 'No unread messages found' };
          }
        }
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        const msg = (await res.json()) as {
          id: string;
          snippet?: string;
          internalDate?: string;
          payload?: Record<string, unknown>;
        };
        const headers =
          (msg.payload?.headers as { name: string; value: string }[] | undefined) ?? [];
        const body = msg.payload ? decodeGmailBody(msg.payload) : msg.snippet ?? '';
        return {
          success: true,
          data: {
            type: 'email.message',
            id: msg.id,
            from: headers.find((h) => h.name === 'From')?.value ?? '',
            subject: headers.find((h) => h.name === 'Subject')?.value ?? '',
            body: body.slice(0, 50_000),
            preview: msg.snippet ?? '',
            timestamp: msg.internalDate
              ? new Date(Number(msg.internalDate)).toISOString()
              : new Date().toISOString(),
          },
        };
      }
      case 'email.send_email': {
        const raw = [
          `To: ${args.to}`,
          `Subject: ${args.subject}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          String(args.body ?? args.message ?? ''),
        ].join('\r\n');
        const encoded = Buffer.from(raw).toString('base64url');
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded }),
        });
        if (!res.ok) return { success: false, error: await res.text() };
        const sent = await res.json();
        return {
          success: true,
          data: { type: 'email.send_result', sent: true, ...(sent as object) },
        };
      }
      case 'calendar.list_upcoming': {
        const maxResults = Number(args.maxResults ?? 10);
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&singleEvents=true&orderBy=startTime&timeMin=${new Date().toISOString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        const data = (await res.json()) as {
          items?: Array<{
            id: string;
            summary?: string;
            start?: { dateTime?: string; date?: string };
            end?: { dateTime?: string; date?: string };
          }>;
        };
        const events = (data.items ?? []).map((e) => ({
          id: e.id,
          title: e.summary ?? '(no title)',
          start: e.start?.dateTime ?? e.start?.date ?? '',
          end: e.end?.dateTime ?? e.end?.date ?? '',
        }));
        return {
          success: true,
          data: { type: 'calendar.event_list', events },
        };
      }
      case 'files.search_documents': {
        const query = String(args.query ?? '');
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`fullText contains '${query.replace(/'/g, "\\'")}'`)}&pageSize=${args.maxResults ?? 10}&fields=files(id,name,mimeType,modifiedTime)`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        const data = (await res.json()) as {
          files?: Array<{ id: string; name: string; mimeType?: string; modifiedTime?: string }>;
        };
        return {
          success: true,
          data: {
            type: 'files.search_result',
            items: (data.files ?? []).map((f) => ({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              modifiedTime: f.modifiedTime,
            })),
          },
        };
      }
      case 'gmail.search': {
        const query = String(args.query ?? '');
        const maxResults = Number(args.maxResults ?? 10);
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        const data = await res.json();
        return { success: true, data };
      }
      case 'gmail.send': {
        const raw = [
          `To: ${args.to}`,
          `Subject: ${args.subject}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          String(args.body),
        ].join('\r\n');
        const encoded = Buffer.from(raw).toString('base64url');
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded }),
        });
        if (!res.ok) return { success: false, error: await res.text() };
        return { success: true, data: await res.json() };
      }
      case 'calendar.list': {
        const maxResults = Number(args.maxResults ?? 10);
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&singleEvents=true&orderBy=startTime&timeMin=${new Date().toISOString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        return { success: true, data: await res.json() };
      }
      case 'email.draft_reply': {
        const messageId = String(args.messageId ?? '');
        const body = String(args.body ?? '');
        const draft = {
          message: {
            raw: Buffer.from(
              ['Content-Type: text/plain; charset=utf-8', '', body].join('\r\n')
            ).toString('base64url'),
            threadId: messageId,
          },
        };
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(draft),
        });
        if (!res.ok) return { success: false, error: await res.text() };
        const created = await res.json();
        return {
          success: true,
          data: { type: 'email.draft_result', draftId: (created as { id?: string }).id },
        };
      }
      case 'calendar.cancel_event': {
        const eventId = String(args.eventId ?? '');
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok && res.status !== 410) {
          return { success: false, error: await res.text() };
        }
        return {
          success: true,
          data: { type: 'calendar.cancel_result', eventId, cancelled: true },
        };
      }
      case 'calendar.create_event': {
        const start = new Date(String(args.start));
        const durationMin = Number(args.durationMin ?? 30);
        const end = new Date(start.getTime() + durationMin * 60_000);
        const event = {
          summary: String(args.title),
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees: (args.attendees as string[] | undefined)?.map((email) => ({ email })),
        };
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
          }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        return { success: true, data: await res.json() };
      }
      case 'drive.search': {
        const query = String(args.query ?? '');
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`fullText contains '${query.replace(/'/g, "\\'")}'`)}&pageSize=${args.maxResults ?? 10}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        return { success: true, data: await res.json() };
      }
      default:
        return { success: false, error: `Unknown Google tool: ${tool}` };
    }
  }

  async sync(_connectionId: string, _credentials: JsonObject): Promise<SyncResult> {
    return { resourcesIndexed: 0 };
  }
}
