import { z } from 'zod';
import type { ToolSource } from '@ai-assistant/types';

export type { ToolSource } from '@ai-assistant/types';

export interface ToolDefinition {
  name: string;
  version: string;
  connector: string;
  description: string;
  parameters: z.ZodType;
  supportsCancellation: boolean;
  dangerous: boolean;
  openAiParameters: Record<string, unknown>;
}

const gmailSearchParams = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

const gmailSendParams = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});

const calendarCreateParams = z.object({
  title: z.string(),
  start: z.string(),
  durationMin: z.number().optional(),
  attendees: z.array(z.string()).optional(),
});

const driveSearchParams = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

const whatsappSendParams = z.object({
  to: z.string(),
  message: z.string(),
});

const whatsappReadChatParams = z.object({
  chatId: z.string().optional(),
  jid: z.string().optional(),
  limit: z.number().optional(),
});

const emailReadParams = z.object({
  messageId: z.string().optional(),
});

const emailSendParams = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string().optional(),
  message: z.string().optional(),
});

const filesSearchParams = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

const filesGetSummaryParams = z.object({
  fileId: z.string(),
});

const filesGetChunksParams = z.object({
  fileId: z.string(),
  query: z.string().optional(),
  limit: z.number().optional(),
});

const filesAnalyzeImageParams = z.object({
  fileId: z.string(),
  query: z.string().optional(),
});

function toOpenAiSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      const zodVal = val as z.ZodTypeAny;
      if (zodVal instanceof z.ZodString) {
        properties[key] = { type: 'string', description: key };
      } else if (zodVal instanceof z.ZodNumber) {
        properties[key] = { type: 'number', description: key };
      } else if (zodVal instanceof z.ZodArray) {
        properties[key] = { type: 'array', items: { type: 'string' } };
      } else {
        properties[key] = { type: 'string' };
      }
      if (!zodVal.isOptional()) required.push(key);
    }
    return { type: 'object', properties, required };
  }
  return { type: 'object', properties: {} };
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: 'gmail.search',
    version: '1',
    connector: 'google',
    description: 'Search Gmail messages',
    parameters: gmailSearchParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(gmailSearchParams),
  },
  {
    name: 'gmail.send',
    version: '1',
    connector: 'google',
    description: 'Send an email via Gmail',
    parameters: gmailSendParams,
    supportsCancellation: false,
    dangerous: true,
    openAiParameters: toOpenAiSchema(gmailSendParams),
  },
  {
    name: 'calendar.create_event',
    version: '1',
    connector: 'google',
    description: 'Create a Google Calendar event',
    parameters: calendarCreateParams,
    supportsCancellation: false,
    dangerous: true,
    openAiParameters: toOpenAiSchema(calendarCreateParams),
  },
  {
    name: 'calendar.list',
    version: '1',
    connector: 'google',
    description: 'List upcoming calendar events',
    parameters: z.object({ maxResults: z.number().optional() }),
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: { type: 'object', properties: { maxResults: { type: 'number' } } },
  },
  {
    name: 'drive.search',
    version: '1',
    connector: 'google',
    description: 'Search Google Drive files',
    parameters: driveSearchParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(driveSearchParams),
  },
  {
    name: 'whatsapp.send_message',
    version: '1',
    connector: 'whatsapp',
    description: 'Send a WhatsApp message',
    parameters: whatsappSendParams,
    supportsCancellation: false,
    dangerous: true,
    openAiParameters: toOpenAiSchema(whatsappSendParams),
  },
  {
    name: 'whatsapp.search_chats',
    version: '1',
    connector: 'whatsapp',
    description: 'Search WhatsApp chats',
    parameters: z.object({ query: z.string() }),
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(z.object({ query: z.string() })),
  },
  {
    name: 'whatsapp.list_unread',
    version: '1',
    connector: 'whatsapp',
    description: 'List unread WhatsApp chats with previews',
    parameters: z.object({ limit: z.number().optional() }),
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(z.object({ limit: z.number().optional() })),
  },
  {
    name: 'whatsapp.read_chat',
    version: '1',
    connector: 'whatsapp',
    description: 'Read messages in a WhatsApp chat',
    parameters: whatsappReadChatParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(whatsappReadChatParams),
  },
  {
    name: 'email.list_unread',
    version: '1',
    connector: 'google',
    description: 'List unread emails',
    parameters: z.object({ maxResults: z.number().optional() }),
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(z.object({ maxResults: z.number().optional() })),
  },
  {
    name: 'email.read_email',
    version: '1',
    connector: 'google',
    description: 'Read an email by id or latest unread',
    parameters: emailReadParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(emailReadParams),
  },
  {
    name: 'email.send_email',
    version: '1',
    connector: 'google',
    description: 'Send an email',
    parameters: emailSendParams,
    supportsCancellation: false,
    dangerous: true,
    openAiParameters: toOpenAiSchema(emailSendParams),
  },
  {
    name: 'calendar.list_upcoming',
    version: '1',
    connector: 'google',
    description: 'List upcoming calendar events',
    parameters: z.object({ maxResults: z.number().optional() }),
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(z.object({ maxResults: z.number().optional() })),
  },
  {
    name: 'files.search_documents',
    version: '1',
    connector: 'google',
    description: 'Search documents in Google Drive',
    parameters: driveSearchParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(driveSearchParams),
  },
  {
    name: 'whatsapp.search_messages',
    version: '1',
    connector: 'whatsapp',
    description: 'Search WhatsApp message history (synced)',
    parameters: z.object({ query: z.string(), limit: z.number().optional() }),
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(z.object({ query: z.string(), limit: z.number().optional() })),
  },
  {
    name: 'resources.search',
    version: '1',
    connector: 'platform',
    description: 'Search across connected apps and stored resources',
    parameters: filesSearchParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(filesSearchParams),
  },
  {
    name: 'contacts.resolve',
    version: '1',
    connector: 'platform',
    description: 'Resolve a contact name to channel address',
    parameters: z.object({ name: z.string(), person: z.string().optional() }),
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(z.object({ name: z.string() })),
  },
  {
    name: 'reminder.create',
    version: '1',
    connector: 'platform',
    description:
      'Create a timed reminder to notify the user. Use for "remind me at...", "remind me tomorrow", recurring reminders.',
    parameters: z.object({
      title: z.string(),
      body: z.string().optional(),
      userPrompt: z.string().optional(),
      nextFireAt: z.string().optional(),
      recurrence: z
        .enum(['NONE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])
        .optional(),
      cronExpression: z.string().optional(),
      timezone: z.string().optional(),
    }),
    supportsCancellation: false,
    dangerous: false,
    openAiParameters: toOpenAiSchema(
      z.object({
        title: z.string(),
        body: z.string().optional(),
        userPrompt: z.string().optional(),
        nextFireAt: z.string().optional(),
        recurrence: z
          .enum(['NONE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])
          .optional(),
        cronExpression: z.string().optional(),
        timezone: z.string().optional(),
      })
    ),
  },
  {
    name: 'reminder.update',
    version: '1',
    connector: 'platform',
    description:
      'Update, pause, or resume an existing reminder. Use to change time, rename, or pause/resume.',
    parameters: z.object({
      reminderId: z.string().optional(),
      title: z.string().optional(),
      body: z.string().optional(),
      userPrompt: z.string().optional(),
      nextFireAt: z.string().optional(),
      recurrence: z
        .enum(['NONE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])
        .optional(),
      cronExpression: z.string().nullable().optional(),
      timezone: z.string().optional(),
      status: z.enum(['PENDING', 'PAUSED']).optional(),
    }),
    supportsCancellation: false,
    dangerous: false,
    openAiParameters: toOpenAiSchema(
      z.object({
        reminderId: z.string().optional(),
        title: z.string().optional(),
        body: z.string().optional(),
        nextFireAt: z.string().optional(),
        recurrence: z
          .enum(['NONE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])
          .optional(),
        cronExpression: z.string().nullable().optional(),
        timezone: z.string().optional(),
        status: z.enum(['PENDING', 'PAUSED']).optional(),
      })
    ),
  },
  {
    name: 'reminder.cancel',
    version: '1',
    connector: 'platform',
    description: 'Cancel and delete a scheduled reminder by id or title match',
    parameters: z.object({
      reminderId: z.string().optional(),
      title: z.string().optional(),
    }),
    supportsCancellation: false,
    dangerous: false,
    openAiParameters: toOpenAiSchema(
      z.object({
        reminderId: z.string().optional(),
        title: z.string().optional(),
      })
    ),
  },
  {
    name: 'email.draft_reply',
    version: '1',
    connector: 'google',
    description: 'Create a draft reply to an email',
    parameters: z.object({
      messageId: z.string(),
      body: z.string(),
    }),
    supportsCancellation: false,
    dangerous: false,
    openAiParameters: toOpenAiSchema(
      z.object({ messageId: z.string(), body: z.string() })
    ),
  },
  {
    name: 'calendar.cancel_event',
    version: '1',
    connector: 'google',
    description: 'Cancel a calendar event',
    parameters: z.object({ eventId: z.string() }),
    supportsCancellation: false,
    dangerous: true,
    openAiParameters: toOpenAiSchema(z.object({ eventId: z.string() })),
  },
  {
    name: 'files.search',
    version: '1',
    connector: 'files',
    description: 'Search uploaded and synced files',
    parameters: filesSearchParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(filesSearchParams),
  },
  {
    name: 'files.get_summary',
    version: '1',
    connector: 'files',
    description: 'Get summary and status for an uploaded file',
    parameters: filesGetSummaryParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(filesGetSummaryParams),
  },
  {
    name: 'files.get_chunks',
    version: '1',
    connector: 'files',
    description: 'Retrieve relevant text chunks from an indexed file',
    parameters: filesGetChunksParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(filesGetChunksParams),
  },
  {
    name: 'files.analyze_image',
    version: '1',
    connector: 'files',
    description: 'Run on-demand vision analysis on an uploaded image',
    parameters: filesAnalyzeImageParams,
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(filesAnalyzeImageParams),
  },
  {
    name: 'notes.create',
    version: '1',
    connector: 'notes',
    description: 'Save a note for the user (title is auto-generated from content if omitted)',
    parameters: z.object({
      title: z.string().optional(),
      content: z.string(),
    }),
    supportsCancellation: false,
    dangerous: false,
    openAiParameters: toOpenAiSchema(
      z.object({ title: z.string().optional(), content: z.string() })
    ),
  },
  {
    name: 'notes.search',
    version: '1',
    connector: 'notes',
    description: 'Search in-app notes',
    parameters: z.object({ query: z.string() }),
    supportsCancellation: true,
    dangerous: false,
    openAiParameters: toOpenAiSchema(z.object({ query: z.string() })),
  },
];

const toolMap = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

export function validateToolArgs(
  name: string,
  args: unknown
): { success: true; data: unknown } | { success: false; error: string } {
  const tool = getToolDefinition(name);
  if (!tool) return { success: false, error: `Unknown tool: ${name}` };
  const result = tool.parameters.safeParse(args);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}

export function listToolsForConnector(connector: string): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => t.connector === connector);
}

export function listAllToolsOpenAi(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return TOOL_REGISTRY.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.openAiParameters,
    },
  }));
}

export function listToolsForUserOpenAi(activeProviderIds: string[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  const allowed = new Set(activeProviderIds);
  allowed.add('notes');
  allowed.add('platform');
  return TOOL_REGISTRY.filter((t) => allowed.has(t.connector)).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.openAiParameters,
    },
  }));
}
