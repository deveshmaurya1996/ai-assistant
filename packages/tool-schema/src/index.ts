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

const filesSearchParams = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
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
  return TOOL_REGISTRY.filter((t) => allowed.has(t.connector)).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.openAiParameters,
    },
  }));
}
