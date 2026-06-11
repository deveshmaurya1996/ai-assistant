/** AUTO-GENERATED from catalog/*.yaml — do not edit by hand. Run: pnpm catalog:generate */

export interface ToolCatalogMeta {
  name: string;
  version: string;
  connector: string;
  description: string;
  schemaRef: string;
  supportsCancellation: boolean;
  dangerous: boolean;
}

export const TOOL_CATALOG_META: ToolCatalogMeta[] = [
  {
    "name": "gmail.search",
    "version": "1",
    "connector": "google",
    "description": "Search Gmail messages",
    "schemaRef": "gmailSearchParams",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "gmail.send",
    "version": "1",
    "connector": "google",
    "description": "Send an email via Gmail",
    "schemaRef": "gmailSendParams",
    "supportsCancellation": false,
    "dangerous": true
  },
  {
    "name": "calendar.create_event",
    "version": "1",
    "connector": "google",
    "description": "Create a Google Calendar event",
    "schemaRef": "calendarCreateParams",
    "supportsCancellation": false,
    "dangerous": true
  },
  {
    "name": "calendar.list",
    "version": "1",
    "connector": "google",
    "description": "List calendar events in a time range (defaults to upcoming from now)",
    "schemaRef": "z",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "whatsapp.send_message",
    "version": "1",
    "connector": "whatsapp",
    "description": "Send a WhatsApp message",
    "schemaRef": "whatsappSendParams",
    "supportsCancellation": false,
    "dangerous": true
  },
  {
    "name": "whatsapp.search_chats",
    "version": "1",
    "connector": "whatsapp",
    "description": "Search WhatsApp chats",
    "schemaRef": "z",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "whatsapp.list_unread",
    "version": "1",
    "connector": "whatsapp",
    "description": "List unread WhatsApp chats with previews",
    "schemaRef": "z",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "whatsapp.read_chat",
    "version": "1",
    "connector": "whatsapp",
    "description": "Read messages in a WhatsApp chat",
    "schemaRef": "whatsappReadChatParams",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "email.list_unread",
    "version": "1",
    "connector": "google",
    "description": "List unread emails",
    "schemaRef": "z",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "email.read_email",
    "version": "1",
    "connector": "google",
    "description": "Read an email by id or latest unread",
    "schemaRef": "emailReadParams",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "email.send_email",
    "version": "1",
    "connector": "google",
    "description": "Send an email",
    "schemaRef": "emailSendParams",
    "supportsCancellation": false,
    "dangerous": true
  },
  {
    "name": "email.search",
    "version": "1",
    "connector": "google",
    "description": "Search Gmail messages by query",
    "schemaRef": "gmailSearchParams",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "email.reply_email",
    "version": "1",
    "connector": "google",
    "description": "Reply to an email in the same thread",
    "schemaRef": "z",
    "supportsCancellation": false,
    "dangerous": true
  },
  {
    "name": "email.compose_draft",
    "version": "1",
    "connector": "google",
    "description": "Save a new email draft without sending",
    "schemaRef": "emailSendParams",
    "supportsCancellation": false,
    "dangerous": false
  },
  {
    "name": "email.mark_starred",
    "version": "1",
    "connector": "google",
    "description": "Star or unstar an email",
    "schemaRef": "z",
    "supportsCancellation": false,
    "dangerous": false
  },
  {
    "name": "calendar.list_upcoming",
    "version": "1",
    "connector": "google",
    "description": "List calendar events in a time range (defaults to upcoming from now)",
    "schemaRef": "z",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "drive.search",
    "version": "1",
    "connector": "google",
    "description": "Search Google Drive by file name or document content",
    "schemaRef": "driveSearchParams",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "drive.get_content",
    "version": "1",
    "connector": "google",
    "description": "Read and export a Google Drive file (Docs, Sheets, Slides, text) for summarization",
    "schemaRef": "z",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "whatsapp.search_messages",
    "version": "1",
    "connector": "whatsapp",
    "description": "Search WhatsApp message history (synced)",
    "schemaRef": "z",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "resources.search",
    "version": "1",
    "connector": "platform",
    "description": "Search across connected apps and stored resources",
    "schemaRef": "resourceSearchParams",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "contacts.resolve",
    "version": "1",
    "connector": "platform",
    "description": "Resolve a contact name to channel address",
    "schemaRef": "z",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "reminder.create",
    "version": "1",
    "connector": "platform",
    "description": "Create a push-notification reminder. Planner MUST supply structured schedule fields: nextFireAt (ISO 8601 with offset), timezone (IANA), recurrence, and cronExpression when recurring. userPrompt preserves the original user text.",
    "schemaRef": "z",
    "supportsCancellation": false,
    "dangerous": false
  },
  {
    "name": "reminder.update",
    "version": "1",
    "connector": "platform",
    "description": "Update, pause, or resume an existing reminder. Use to change time, rename, or pause/resume.",
    "schemaRef": "z",
    "supportsCancellation": false,
    "dangerous": false
  },
  {
    "name": "reminder.cancel",
    "version": "1",
    "connector": "platform",
    "description": "Cancel and delete a scheduled reminder by id or title match",
    "schemaRef": "z",
    "supportsCancellation": false,
    "dangerous": false
  },
  {
    "name": "reminder.list",
    "version": "1",
    "connector": "platform",
    "description": "List pending reminders for status or countdown queries (\"how long until my next reminder?\").",
    "schemaRef": "z",
    "supportsCancellation": true,
    "dangerous": false
  },
  {
    "name": "automation.create",
    "version": "1",
    "connector": "platform",
    "description": "Create a recurring inbox digest automation. Planner MUST supply cronExpression, timezone (IANA), and query as plain English (never tool IDs like email.list_unread).",
    "schemaRef": "automationCreateParams",
    "supportsCancellation": false,
    "dangerous": false
  },
  {
    "name": "automation.update",
    "version": "1",
    "connector": "platform",
    "description": "Update an existing automation (schedule, query, name, or pause/resume). Match by automationId or name.",
    "schemaRef": "automationUpdateParams",
    "supportsCancellation": false,
    "dangerous": false
  },
  {
    "name": "automation.cancel",
    "version": "1",
    "connector": "platform",
    "description": "Delete/cancel a recurring automation by id or name match",
    "schemaRef": "automationCancelParams",
    "supportsCancellation": false,
    "dangerous": false
  },
  {
    "name": "email.draft_reply",
    "version": "1",
    "connector": "google",
    "description": "Create a draft reply to an email",
    "schemaRef": "z",
    "supportsCancellation": false,
    "dangerous": false
  },
  {
    "name": "calendar.cancel_event",
    "version": "1",
    "connector": "google",
    "description": "Cancel a calendar event",
    "schemaRef": "z",
    "supportsCancellation": false,
    "dangerous": true
  },
  {
    "name": "image.edit",
    "version": "1",
    "connector": "platform",
    "description": "Generate or edit an image from a text prompt",
    "schemaRef": "z",
    "supportsCancellation": false,
    "dangerous": true
  }
];

export const PLATFORM_TOOL_NAMES = TOOL_CATALOG_META.filter((t) => t.connector === 'platform').map(
  (t) => t.name
);

export function isPlatformTool(name: string): boolean {
  return PLATFORM_TOOL_NAMES.includes(name);
}
