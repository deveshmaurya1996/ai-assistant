import type {
  Capability,
  ConnectChallenge,
  ConnectUrlOptions,
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
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

export const GOOGLE_TOOL_NAMESPACES = ['gmail', 'calendar', 'email', 'drive'] as const;

const GOOGLE_DRIVE_EXPORT_MIME: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

const DRIVE_TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml'];

function escapeDriveQueryTerm(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildDriveSearchQuery(query: string): string {
  const term = escapeDriveQueryTerm(query.trim());
  if (!term) {
    return 'trashed=false';
  }
  return `trashed=false and (name contains '${term}' or fullText contains '${term}')`;
}

async function searchDriveFiles(
  token: string,
  query: string,
  maxResults: number
): Promise<ToolResult> {
  const q = buildDriveSearchQuery(query);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${maxResults}&fields=files(id,name,mimeType,modifiedTime,webViewLink,size)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: formatGoogleApiError(res.status, errText, 'drive') };
  }
  const data = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType?: string;
      modifiedTime?: string;
      webViewLink?: string;
      size?: string;
    }>;
  };
  return {
    success: true,
    data: {
      type: 'drive.search_result',
      query,
      items: (data.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        sizeBytes: f.size ? Number(f.size) : undefined,
      })),
    },
  };
}

async function getDriveFileContent(
  token: string,
  fileId: string,
  maxChars: number
): Promise<ToolResult> {
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    const errText = await metaRes.text();
    return { success: false, error: formatGoogleApiError(metaRes.status, errText, 'drive') };
  }
  const meta = (await metaRes.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    webViewLink?: string;
  };

  const exportMime = GOOGLE_DRIVE_EXPORT_MIME[meta.mimeType];
  let content = '';

  if (exportMime) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: formatGoogleApiError(res.status, errText, 'drive') };
    }
    content = await res.text();
  } else if (DRIVE_TEXT_MIME_PREFIXES.some((p) => meta.mimeType.startsWith(p))) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: formatGoogleApiError(res.status, errText, 'drive') };
    }
    content = await res.text();
  } else if (meta.mimeType === 'application/pdf') {
    return {
      success: false,
      error:
        'PDF files cannot be read directly from Drive yet. Open the file in Drive or convert it to a Google Doc.',
    };
  } else {
    return {
      success: false,
      error: `Cannot read this Drive file type (${meta.mimeType}). Supported: Google Docs/Sheets/Slides and plain text files.`,
    };
  }

  const truncated = content.length > maxChars;
  return {
    success: true,
    data: {
      type: 'drive.content',
      fileId: meta.id,
      name: meta.name,
      mimeType: meta.mimeType,
      webViewLink: meta.webViewLink,
      content: content.slice(0, maxChars),
      truncated,
      charCount: content.length,
    },
  };
}

function extractEmailAddress(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return (match ? match[1] : header).trim();
}

function replySubject(subject: string): string {
  const s = subject.trim() || '(no subject)';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

type GmailMessageMeta = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  messageIdHeader: string;
};

async function fetchGmailMessageMeta(
  token: string,
  messageId: string
): Promise<GmailMessageMeta | ToolResult> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    return { success: false, error: formatGoogleApiError(res.status, await res.text()) };
  }
  const msg = (await res.json()) as {
    id: string;
    threadId?: string;
    payload?: { headers?: { name: string; value: string }[] };
  };
  const headers = msg.payload?.headers ?? [];
  const get = (name: string) => headers.find((h) => h.name === name)?.value ?? '';
  return {
    id: msg.id,
    threadId: msg.threadId ?? msg.id,
    from: get('From'),
    to: get('To'),
    subject: get('Subject'),
    messageIdHeader: get('Message-ID'),
  };
}

function encodeGmailRaw(lines: string[]): string {
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

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

function formatGoogleApiError(
  status: number,
  body: string,
  service: 'gmail' | 'calendar' | 'drive' = 'gmail'
): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> };
    };
    const msg = parsed.error?.message ?? body;
    const reason = parsed.error?.errors?.[0]?.reason ?? '';
    if (status === 401 || reason === 'authError') {
      return 'Google sign-in expired — open Connect Apps and reconnect Google.';
    }
    if (status === 403 && /has not been used|accessNotConfigured|SERVICE_DISABLED/i.test(msg)) {
      const apiName =
        service === 'calendar'
          ? 'Google Calendar API'
          : service === 'drive'
            ? 'Google Drive API'
            : 'Gmail API';
      return `${apiName} is not enabled for this app in Google Cloud Console. Enable it for your OAuth project, then reconnect Google in Connect Apps.`;
    }
    if (status === 403) {
      return `Google denied access: ${msg}`;
    }
    return msg.slice(0, 400);
  } catch {
    return body.slice(0, 400);
  }
}

async function probeGoogleApi(
  token: string,
  url: string,
  service: 'gmail' | 'calendar' | 'drive'
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return { ok: true };
  const body = await res.text();
  return { ok: false, message: formatGoogleApiError(res.status, body, service) };
}

export class GoogleConnector implements IntegrationConnector {
  providerId = 'google';
  capabilities: Capability[] = ['search', 'read', 'write', 'schedule'];

  async getConnectUrl(
    userId: string,
    state: string,
    options?: ConnectUrlOptions
  ): Promise<ConnectChallenge> {
    const { clientId, redirectUri } = assertGoogleIntegrationConfigured();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: options?.hasRefreshToken ? 'none' : 'consent',
      state: `${userId}:${state}`,
    });
    if (options?.loginHint) {
      params.set('login_hint', options.loginHint);
    }

    return {
      type: 'oauth',
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
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

  async refreshTokens(
    _connectionId: string,
    credentials: JsonObject
  ): Promise<JsonObject> {
    const refreshToken = credentials.refresh_token as string | undefined;
    if (!refreshToken) {
      throw new Error('No Google refresh token — reconnect Google in Connect Apps');
    }

    const { clientId, clientSecret } = assertGoogleIntegrationConfigured();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      throw new Error(`Google token refresh failed: ${await res.text()}`);
    }

    const tokens = (await res.json()) as JsonObject;
    return {
      ...credentials,
      ...tokens,
      refresh_token: (tokens.refresh_token as string | undefined) ?? refreshToken,
    };
  }

  private async ensureAccessToken(
    connectionId: string,
    credentials: JsonObject
  ): Promise<{ creds: JsonObject; refreshed: boolean }> {
    const refreshToken = credentials.refresh_token as string | undefined;
    if (refreshToken) {
      try {
        const creds = await this.refreshTokens(connectionId, credentials);
        return { creds, refreshed: true };
      } catch (err) {
        if (!credentials.access_token) {
          throw err;
        }
      }
    }
    if (!credentials.access_token) {
      throw new Error('No Google refresh token — reconnect Google in Connect Apps');
    }
    return { creds: credentials, refreshed: false };
  }

  async healthCheck(connectionId: string, credentials: JsonObject): Promise<HealthStatus> {
    try {
      const { creds, refreshed } = await this.ensureAccessToken(connectionId, credentials);
      const token = creds.access_token as string | undefined;
      if (!token) {
        return { healthy: false, message: 'Missing access token — reconnect Google in Connect Apps' };
      }

      const tokenRes = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`
      );
      if (!tokenRes.ok) {
        return {
          healthy: false,
          message: 'Google access expired — reconnect in Connect Apps',
        };
      }

      const probes = await Promise.all([
        probeGoogleApi(
          token,
          'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1',
          'gmail'
        ),
        probeGoogleApi(
          token,
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&timeMin=${encodeURIComponent(new Date().toISOString())}`,
          'calendar'
        ),
        probeGoogleApi(
          token,
          'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)',
          'drive'
        ),
      ]);

      const failed = probes.find((p) => !p.ok);
      if (failed && !failed.ok) {
        return { healthy: false, message: failed.message };
      }

      return {
        healthy: true,
        ...(refreshed ? { refreshedCredentials: creds } : {}),
      };
    } catch (err) {
      return {
        healthy: false,
        message:
          err instanceof Error
            ? err.message
            : 'Google token refresh failed — reconnect in Connect Apps',
      };
    }
  }

  async executeTool(
    connectionId: string,
    tool: string,
    args: JsonObject,
    _ctx: ExecutionContext,
    credentials: JsonObject
  ): Promise<ToolResult> {
    let creds: JsonObject;
    try {
      ({ creds } = await this.ensureAccessToken(connectionId, credentials));
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Not authenticated with Google',
      };
    }

    const token = creds.access_token as string | undefined;
    if (!token) return { success: false, error: 'Not authenticated with Google' };

    switch (tool) {
      case 'email.list_unread': {
        const maxResults = Number(args.maxResults ?? 15);
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread in:inbox')}&maxResults=${maxResults}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, error: formatGoogleApiError(res.status, errText) };
        }
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
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('in:inbox')}&maxResults=1`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!listRes.ok) return { success: false, error: await listRes.text() };
          const list = (await listRes.json()) as { messages?: { id: string }[] };
          messageId = list.messages?.[0]?.id;
          if (!messageId) {
            return { success: false, error: 'No messages found in inbox' };
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
        const encoded = encodeGmailRaw([
          `To: ${args.to}`,
          `Subject: ${args.subject}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          String(args.body ?? args.message ?? ''),
        ]);
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
      case 'email.search': {
        const query = String(args.query ?? '');
        const maxResults = Number(args.maxResults ?? 10);
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          return { success: false, error: formatGoogleApiError(res.status, await res.text()) };
        }
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
          items.push({
            id: msg.id,
            from: headers.find((h) => h.name === 'From')?.value ?? '',
            subject: headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)',
            preview: msg.snippet ?? '',
            timestamp: msg.internalDate
              ? new Date(Number(msg.internalDate)).toISOString()
              : new Date().toISOString(),
          });
        }
        return {
          success: true,
          data: { type: 'email.search_result', query, items },
        };
      }
      case 'email.reply_email': {
        const messageId = String(args.messageId ?? '');
        const body = String(args.body ?? '');
        if (!messageId) return { success: false, error: 'messageId required' };
        const meta = await fetchGmailMessageMeta(token, messageId);
        if ('success' in meta && meta.success === false) return meta;
        const m = meta as GmailMessageMeta;
        const to = extractEmailAddress(m.from);
        const subject = replySubject(m.subject);
        const rawLines = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/plain; charset=utf-8',
          ...(m.messageIdHeader ? [`In-Reply-To: ${m.messageIdHeader}`] : []),
          ...(m.messageIdHeader ? [`References: ${m.messageIdHeader}`] : []),
          '',
          body,
        ];
        const encoded = encodeGmailRaw(rawLines);
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded, threadId: m.threadId }),
        });
        if (!res.ok) return { success: false, error: await res.text() };
        const sent = await res.json();
        return {
          success: true,
          data: { type: 'email.reply_result', sent: true, threadId: m.threadId, ...(sent as object) },
        };
      }
      case 'email.compose_draft': {
        const to = String(args.to ?? '');
        const subject = String(args.subject ?? '');
        const body = String(args.body ?? '');
        if (!to) return { success: false, error: 'to required' };
        const encoded = encodeGmailRaw([
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          body,
        ]);
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: { raw: encoded } }),
        });
        if (!res.ok) return { success: false, error: await res.text() };
        const created = await res.json();
        return {
          success: true,
          data: {
            type: 'email.draft_result',
            draftId: (created as { id?: string }).id,
            to,
            subject,
          },
        };
      }
      case 'email.mark_starred': {
        const messageId = String(args.messageId ?? '');
        if (!messageId) return { success: false, error: 'messageId required' };
        const starred = args.starred !== false;
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              starred ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] }
            ),
          }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        return {
          success: true,
          data: { type: 'email.star_result', messageId, starred },
        };
      }
      case 'calendar.list_upcoming': {
        const maxResults = Number(args.maxResults ?? 10);
        const timeMin =
          typeof args.timeMin === 'string' && args.timeMin.trim()
            ? args.timeMin.trim()
            : new Date().toISOString();
        const params = new URLSearchParams({
          maxResults: String(maxResults),
          singleEvents: 'true',
          orderBy: 'startTime',
          timeMin,
        });
        if (typeof args.timeMax === 'string' && args.timeMax.trim()) {
          params.set('timeMax', args.timeMax.trim());
        }
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, error: formatGoogleApiError(res.status, errText, 'calendar') };
        }
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
          data: {
            type: 'calendar.event_list',
            events,
            timeMin,
            ...(typeof args.timeMax === 'string' && args.timeMax.trim()
              ? { timeMax: args.timeMax.trim() }
              : {}),
            ...(typeof args.rangeLabel === 'string' && args.rangeLabel.trim()
              ? { rangeLabel: args.rangeLabel.trim() }
              : {}),
          },
        };
      }
      case 'drive.search':
      case 'files.search_documents': {
        const query = String(args.query ?? '');
        const maxResults = Math.min(Number(args.maxResults ?? 10), 25);
        return searchDriveFiles(token, query, maxResults);
      }
      case 'drive.get_content': {
        const fileId = String(args.fileId ?? '');
        if (!fileId) return { success: false, error: 'fileId required' };
        const maxChars = Math.min(Number(args.maxChars ?? 32_000), 64_000);
        return getDriveFileContent(token, fileId, maxChars);
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
        const timeMin =
          typeof args.timeMin === 'string' && args.timeMin.trim()
            ? args.timeMin.trim()
            : new Date().toISOString();
        const params = new URLSearchParams({
          maxResults: String(maxResults),
          singleEvents: 'true',
          orderBy: 'startTime',
          timeMin,
        });
        if (typeof args.timeMax === 'string' && args.timeMax.trim()) {
          params.set('timeMax', args.timeMax.trim());
        }
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return { success: false, error: await res.text() };
        return { success: true, data: await res.json() };
      }
      case 'email.draft_reply': {
        const messageId = String(args.messageId ?? '');
        const body = String(args.body ?? '');
        if (!messageId) return { success: false, error: 'messageId required' };
        const meta = await fetchGmailMessageMeta(token, messageId);
        if ('success' in meta && meta.success === false) return meta;
        const m = meta as GmailMessageMeta;
        const to = extractEmailAddress(m.from);
        const subject = replySubject(m.subject);
        const rawLines = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/plain; charset=utf-8',
          ...(m.messageIdHeader ? [`In-Reply-To: ${m.messageIdHeader}`] : []),
          ...(m.messageIdHeader ? [`References: ${m.messageIdHeader}`] : []),
          '',
          body,
        ];
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: { raw: encodeGmailRaw(rawLines), threadId: m.threadId },
          }),
        });
        if (!res.ok) return { success: false, error: await res.text() };
        const created = await res.json();
        return {
          success: true,
          data: {
            type: 'email.draft_result',
            draftId: (created as { id?: string }).id,
            threadId: m.threadId,
          },
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
      default:
        return { success: false, error: `Unknown Google tool: ${tool}` };
    }
  }

  async sync(_connectionId: string, _credentials: JsonObject): Promise<SyncResult> {
    return { resourcesIndexed: 0 };
  }
}
