import { contactDomainResolvePerson } from '@ai-assistant/contacts';
import { getConnector, type ToolResult } from '@ai-assistant/integrations';
import {
  mergeResourceHits,
  resourceDomainSearch,
  searchMessagingMessages,
  type ResourceHit,
} from '@ai-assistant/resources';
import { decryptCredentials } from './encryption';

export async function executePlatformTool(
  userId: string,
  tool: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  switch (tool) {
    case 'resources.search': {
      const query = String(args.query ?? '');
      const limit = Number(args.limit ?? args.maxResults ?? 20);
      const base = await resourceDomainSearch(userId, query, { limit });
      const liveHits = await fanOutLiveResourceSearch(userId, query, limit);
      const items = mergeResourceHits(base, liveHits, limit);
      return {
        success: true,
        data: { type: 'resources.search_result', query, items, total: items.length },
      };
    }
    case 'contacts.resolve': {
      const name = String(args.name ?? args.person ?? '');
      const matches = await contactDomainResolvePerson(userId, name);
      return {
        success: true,
        data: { type: 'contacts.resolve_result', name, matches },
      };
    }
    case 'whatsapp.search_messages': {
      const query = String(args.query ?? '');
      const limit = Number(args.limit ?? 20);
      const data = await searchMessagingMessages(userId, query, limit);
      return { success: true, data };
    }
    default:
      return { success: false, error: `Unknown platform tool: ${tool}` };
  }
}

async function normalizeToolResult(
  raw: ToolResult | AsyncGenerator<unknown, ToolResult>
): Promise<ToolResult> {
  if (raw && typeof (raw as AsyncGenerator<unknown, ToolResult>)[Symbol.asyncIterator] === 'function') {
    let last: ToolResult = { success: false, error: 'No result' };
    for await (const chunk of raw as AsyncGenerator<unknown, ToolResult>) {
      if (chunk && typeof chunk === 'object' && 'success' in chunk) {
        last = chunk as ToolResult;
      }
    }
    return last;
  }
  return raw as ToolResult;
}

async function fanOutLiveResourceSearch(
  userId: string,
  query: string,
  limit: number
): Promise<ResourceHit[]> {
  const hits: ResourceHit[] = [];
  const connections = await import('@ai-assistant/database').then(({ prisma }) =>
    prisma.userConnection.findMany({
      where: { userId, status: 'ACTIVE' },
    })
  );

  for (const conn of connections) {
    if (conn.providerId !== 'google') continue;
    const connector = getConnector('google');
    if (!connector || !conn.encryptedCredentials) continue;
    let credentials: Record<string, unknown> = {};
    try {
      credentials = JSON.parse(decryptCredentials(conn.encryptedCredentials));
    } catch {
      continue;
    }

    const ctx = {
      userId,
      connectionId: conn.id,
      source: 'chat' as const,
      confirmed: true,
      executionId: `resource_${Date.now()}`,
    };

    const [gmailRaw, driveRaw] = await Promise.all([
      connector.executeTool(
        conn.id,
        'gmail.search',
        { query, maxResults: limit },
        ctx,
        credentials
      ),
      connector.executeTool(
        conn.id,
        'files.search_documents',
        { query, maxResults: limit },
        ctx,
        credentials
      ),
    ]);

    const gmail = await normalizeToolResult(gmailRaw);
    const drive = await normalizeToolResult(driveRaw);

    if (gmail.success && gmail.data) {
      const messages = (gmail.data as { messages?: Array<{ id: string }> }).messages ?? [];
      for (const m of messages) {
        hits.push({
          id: m.id,
          provider: 'gmail',
          title: `Email ${m.id}`,
        });
      }
    }

    if (drive.success && drive.data) {
      const items =
        (drive.data as { items?: Array<{ id: string; name: string; mimeType?: string }> }).items ??
        [];
      for (const f of items) {
        hits.push({
          id: f.id,
          provider: 'drive',
          title: f.name,
          mimeType: f.mimeType,
        });
      }
    }
  }

  return hits;
}
