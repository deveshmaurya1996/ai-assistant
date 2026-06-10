import { contactDomainResolvePerson } from '@ai-assistant/contacts';
import { getConnector, type ToolResult } from '@ai-assistant/integrations';
import {
  mergeResourceHits,
  resourceDomainSearch,
  searchMessagingMessages,
  type ResourceHit,
} from '@ai-assistant/resources';
import { decryptCredentials } from './encryption';
import { gatewayInternalFetch } from './gateway-internal';

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
    case 'reminder.create': {
      const res = await gatewayInternalFetch('/internal/reminders', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          title: String(args.title ?? 'Reminder'),
          body: args.body ? String(args.body) : undefined,
          userPrompt: args.userPrompt ? String(args.userPrompt) : undefined,
          nextFireAt: args.nextFireAt ? String(args.nextFireAt) : undefined,
          recurrence: args.recurrence,
          cronExpression: args.cronExpression ? String(args.cronExpression) : undefined,
          timezone: args.timezone ? String(args.timezone) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: (data as { error?: string }).error ?? 'Failed to create reminder',
        };
      }
      return { success: true, data: { type: 'reminder.created', reminder: data } };
    }
    case 'reminder.update': {
      const res = await gatewayInternalFetch('/internal/reminders', {
        method: 'PATCH',
        body: JSON.stringify({
          userId,
          reminderId: args.reminderId ? String(args.reminderId) : undefined,
          title: args.title ? String(args.title) : undefined,
          body: args.body ? String(args.body) : undefined,
          userPrompt: args.userPrompt ? String(args.userPrompt) : undefined,
          nextFireAt: args.nextFireAt ? String(args.nextFireAt) : undefined,
          recurrence: args.recurrence,
          cronExpression: args.cronExpression,
          timezone: args.timezone ? String(args.timezone) : undefined,
          status: args.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: (data as { error?: string }).error ?? 'Failed to update reminder',
        };
      }
      return { success: true, data: { type: 'reminder.updated', reminder: data } };
    }
    case 'reminder.cancel': {
      const res = await gatewayInternalFetch('/internal/reminders', {
        method: 'DELETE',
        body: JSON.stringify({
          userId,
          reminderId: args.reminderId ? String(args.reminderId) : undefined,
          title: args.title ? String(args.title) : undefined,
        }),
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: (data as { error?: string }).error ?? 'Failed to cancel reminder',
        };
      }
      return { success: true, data: { type: 'reminder.cancelled' } };
    }
    case 'reminder.list': {
      const params = new URLSearchParams({ userId });
      if (args.status) params.set('status', String(args.status));
      if (args.title) params.set('title', String(args.title));
      const res = await gatewayInternalFetch(`/internal/reminders?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: (data as { error?: string }).error ?? 'Failed to list reminders',
        };
      }
      return {
        success: true,
        data: {
          type: 'reminder.list_result',
          reminders: Array.isArray(data) ? data : [],
        },
      };
    }
    case 'automation.create': {
      const res = await gatewayInternalFetch('/internal/automations', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          name: args.name ? String(args.name) : args.pushTitle ? String(args.pushTitle) : undefined,
          schedule: String(args.cronExpression ?? '0 8 * * *'),
          timezone: String(args.timezone),
          query: String(args.query),
          userPrompt: args.userPrompt ? String(args.userPrompt) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: (data as { error?: string }).error ?? 'Failed to create automation',
        };
      }
      return { success: true, data: { type: 'automation.created', automation: data } };
    }
    case 'automation.update': {
      const res = await gatewayInternalFetch('/internal/automations', {
        method: 'PATCH',
        body: JSON.stringify({
          userId,
          automationId: args.automationId ? String(args.automationId) : undefined,
          name: args.name ? String(args.name) : undefined,
          cronExpression: args.cronExpression ? String(args.cronExpression) : undefined,
          timezone: args.timezone ? String(args.timezone) : undefined,
          query: args.query ? String(args.query) : undefined,
          isActive: typeof args.isActive === 'boolean' ? args.isActive : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: (data as { error?: string }).error ?? 'Failed to update automation',
        };
      }
      return { success: true, data: { type: 'automation.updated', automation: data } };
    }
    case 'automation.cancel': {
      const res = await gatewayInternalFetch('/internal/automations', {
        method: 'DELETE',
        body: JSON.stringify({
          userId,
          automationId: args.automationId ? String(args.automationId) : undefined,
          name: args.name ? String(args.name) : undefined,
        }),
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: (data as { error?: string }).error ?? 'Failed to cancel automation',
        };
      }
      return { success: true, data: { type: 'automation.cancelled' } };
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
        'drive.search',
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
