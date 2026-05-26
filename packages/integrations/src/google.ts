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

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

export const GOOGLE_TOOL_NAMESPACES = ['gmail', 'calendar', 'drive'] as const;

export class GoogleConnector implements IntegrationConnector {
  providerId = 'google';
  capabilities: Capability[] = ['search', 'read', 'write', 'schedule'];

  async getConnectUrl(userId: string, state: string): Promise<ConnectChallenge> {
    const clientId = process.env.GOOGLE_INTEGRATION_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
    const apiBase =
      process.env.API_PUBLIC_URL ??
      process.env.BETTER_AUTH_URL ??
      'http://localhost:3000';
    const redirectUri =
      process.env.GOOGLE_INTEGRATION_REDIRECT_URI ??
      `${apiBase.replace(/\/$/, '')}/integrations/google/callback`;

    if (!clientId) {
      throw new Error('GOOGLE_INTEGRATION_CLIENT_ID not configured');
    }

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
    const clientId = process.env.GOOGLE_INTEGRATION_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
    const clientSecret =
      process.env.GOOGLE_INTEGRATION_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
    const apiBase =
      process.env.API_PUBLIC_URL ??
      process.env.BETTER_AUTH_URL ??
      'http://localhost:3000';
    const redirectUri =
      process.env.GOOGLE_INTEGRATION_REDIRECT_URI ??
      `${apiBase.replace(/\/$/, '')}/integrations/google/callback`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
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
