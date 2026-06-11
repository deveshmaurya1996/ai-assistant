import { z } from 'zod';

export const gmailSearchParams = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

export const gmailSendParams = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});

export const calendarCreateParams = z.object({
  title: z.string(),
  start: z.string(),
  durationMin: z.number().optional(),
  attendees: z.array(z.string()).optional(),
});

export const calendarListParams = z.object({
  maxResults: z.number().optional(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  rangeLabel: z.string().optional(),
});

export const driveSearchParams = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

export const driveGetContentParams = z.object({
  fileId: z.string(),
  maxChars: z.number().optional(),
});

export const whatsappSendParams = z.object({
  to: z.string(),
  message: z.string(),
});

export const whatsappReadChatParams = z.object({
  chatId: z.string().optional(),
  jid: z.string().optional(),
  limit: z.number().optional(),
});

export const emailReadParams = z.object({
  messageId: z.string().optional(),
});

export const emailSendParams = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string().optional(),
  message: z.string().optional(),
});

export const resourceSearchParams = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

export const automationCreateParams = z.object({
  name: z.string().optional(),
  pushTitle: z.string().optional(),
  cronExpression: z.string(),
  timezone: z.string(),
  query: z.string(),
  userPrompt: z.string().optional(),
});

export const automationUpdateParams = z.object({
  automationId: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  query: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const automationCancelParams = z.object({
  automationId: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
});

export type AutomationCreateArgs = z.infer<typeof automationCreateParams>;
export type AutomationUpdateArgs = z.infer<typeof automationUpdateParams>;
export type AutomationCancelArgs = z.infer<typeof automationCancelParams>;

export const TOOL_PARAMETER_SCHEMAS: Record<string, z.ZodType> = {
  'gmail.search': gmailSearchParams,
  'gmail.send': gmailSendParams,
  'calendar.create_event': calendarCreateParams,
  'calendar.list': calendarListParams,
  'calendar.list_upcoming': calendarListParams,
  'whatsapp.send_message': whatsappSendParams,
  'whatsapp.search_chats': z.object({ query: z.string() }),
  'whatsapp.list_unread': z.object({ limit: z.number().optional() }),
  'whatsapp.read_chat': whatsappReadChatParams,
  'whatsapp.search_messages': z.object({ query: z.string(), limit: z.number().optional() }),
  'email.list_unread': z.object({ maxResults: z.number().optional() }),
  'email.read_email': emailReadParams,
  'email.send_email': emailSendParams,
  'email.search': gmailSearchParams,
  'email.reply_email': z.object({ messageId: z.string(), body: z.string() }),
  'email.compose_draft': emailSendParams,
  'email.mark_starred': z.object({ messageId: z.string(), starred: z.boolean().optional() }),
  'email.draft_reply': z.object({ messageId: z.string(), body: z.string() }),
  'drive.search': driveSearchParams,
  'drive.get_content': driveGetContentParams,
  'resources.search': resourceSearchParams,
  'contacts.resolve': z.object({ name: z.string(), person: z.string().optional() }),
  'reminder.create': z.object({
    title: z.string(),
    body: z.string().optional(),
    userPrompt: z.string().optional(),
    nextFireAt: z.string(),
    recurrence: z.enum(['NONE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']),
    cronExpression: z.string().optional(),
    timezone: z.string(),
  }),
  'reminder.update': z.object({
    reminderId: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    userPrompt: z.string().optional(),
    nextFireAt: z.string().optional(),
    recurrence: z.enum(['NONE', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
    cronExpression: z.string().nullable().optional(),
    timezone: z.string().optional(),
    status: z.enum(['PENDING', 'PAUSED']).optional(),
  }),
  'reminder.cancel': z.object({
    reminderId: z.string().optional(),
    title: z.string().optional(),
  }),
  'reminder.list': z.object({
    status: z.enum(['PENDING', 'PAUSED', 'ALL']).optional(),
    title: z.string().optional(),
  }),
  'automation.create': automationCreateParams,
  'automation.update': automationUpdateParams,
  'automation.cancel': automationCancelParams,
  'calendar.cancel_event': z.object({ eventId: z.string() }),
  'image.edit': z.object({
    prompt: z.string(),
    imageUrl: z.string().optional(),
    aspectRatio: z.string().optional(),
  }),
};
