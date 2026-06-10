import type { RiskLevel } from './types';

export interface CapabilityProviderSource {
  providerId: string;
  adapterAction: string;
  executionTool: string;
  permissions?: string[];
}

export interface CapabilitySourceEntry {
  id: string;
  domain: 'messaging' | 'email' | 'calendar' | 'files' | 'notes' | 'contacts' | 'platform';
  description: string;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  plannerVisible: boolean;
  resultSchema: string;
  providers: CapabilityProviderSource[];
}

export const CAPABILITY_SOURCE: CapabilitySourceEntry[] = [
  {
    id: 'messaging.list_unread',
    domain: 'messaging',
    description: 'List unread WhatsApp (or messaging) conversations with message previews',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'MessagingUnreadList',
    providers: [
      {
        providerId: 'whatsapp',
        adapterAction: 'list_unread',
        executionTool: 'whatsapp.list_unread',
        permissions: ['whatsapp.read'],
      },
    ],
  },
  {
    id: 'messaging.read_chat',
    domain: 'messaging',
    description: 'Read recent messages in a chat conversation',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'MessagingConversation',
    providers: [
      {
        providerId: 'whatsapp',
        adapterAction: 'read_chat',
        executionTool: 'whatsapp.read_chat',
        permissions: ['whatsapp.read'],
      },
    ],
  },
  {
    id: 'messaging.send_message',
    domain: 'messaging',
    description: 'Send an instant message',
    risk: 'high',
    requiresConfirmation: true,
    plannerVisible: true,
    resultSchema: 'MessagingSendResult',
    providers: [
      {
        providerId: 'whatsapp',
        adapterAction: 'send_message',
        executionTool: 'whatsapp.send_message',
        permissions: ['whatsapp.send'],
      },
    ],
  },
  {
    id: 'email.list_unread',
    domain: 'email',
    description: 'List unread emails with subject and preview',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'EmailUnreadList',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'list_unread',
        executionTool: 'email.list_unread',
        permissions: ['gmail.read'],
      },
    ],
  },
  {
    id: 'email.read_email',
    domain: 'email',
    description: 'Read a single email by id or the latest unread',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'EmailMessage',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'read_email',
        executionTool: 'email.read_email',
        permissions: ['gmail.read'],
      },
    ],
  },
  {
    id: 'email.send_email',
    domain: 'email',
    description: 'Send an email',
    risk: 'high',
    requiresConfirmation: true,
    plannerVisible: true,
    resultSchema: 'EmailSendResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'send_email',
        executionTool: 'email.send_email',
        permissions: ['gmail.send'],
      },
    ],
  },
  {
    id: 'email.search',
    domain: 'email',
    description: 'Search Gmail by query (from, subject, keywords)',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'EmailSearchResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'search_email',
        executionTool: 'email.search',
        permissions: ['gmail.read'],
      },
    ],
  },
  {
    id: 'email.reply_email',
    domain: 'email',
    description: 'Reply to an email in the same thread',
    risk: 'high',
    requiresConfirmation: true,
    plannerVisible: true,
    resultSchema: 'EmailReplyResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'reply_email',
        executionTool: 'email.reply_email',
        permissions: ['gmail.send'],
      },
    ],
  },
  {
    id: 'email.compose_draft',
    domain: 'email',
    description: 'Compose and save an email draft without sending',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'EmailDraftResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'compose_draft',
        executionTool: 'email.compose_draft',
        permissions: ['gmail.compose'],
      },
    ],
  },
  {
    id: 'email.draft_reply',
    domain: 'email',
    description: 'Save a reply draft without sending',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'EmailDraftResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'draft_reply',
        executionTool: 'email.draft_reply',
        permissions: ['gmail.compose'],
      },
    ],
  },
  {
    id: 'email.mark_starred',
    domain: 'email',
    description: 'Star or unstar an email',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'EmailStarResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'mark_starred',
        executionTool: 'email.mark_starred',
        permissions: ['gmail.modify'],
      },
    ],
  },
  {
    id: 'calendar.list_upcoming',
    domain: 'calendar',
    description: 'List upcoming calendar events',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'CalendarEventList',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'list_upcoming',
        executionTool: 'calendar.list_upcoming',
        permissions: ['calendar.read'],
      },
    ],
  },
  {
    id: 'calendar.create_event',
    domain: 'calendar',
    description: 'Create a Google Calendar event',
    risk: 'high',
    requiresConfirmation: true,
    plannerVisible: true,
    resultSchema: 'CalendarCreateResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'create_event',
        executionTool: 'calendar.create_event',
        permissions: ['calendar.write'],
      },
    ],
  },
  {
    id: 'calendar.cancel_event',
    domain: 'calendar',
    description: 'Cancel a calendar event',
    risk: 'high',
    requiresConfirmation: true,
    plannerVisible: true,
    resultSchema: 'CalendarCancelResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'cancel_event',
        executionTool: 'calendar.cancel_event',
        permissions: ['calendar.write'],
      },
    ],
  },
  {
    id: 'drive.search',
    domain: 'files',
    description: 'Search Google Drive by file name or content',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'DriveSearchResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'search_drive',
        executionTool: 'drive.search',
        permissions: ['drive.read'],
      },
    ],
  },
  {
    id: 'drive.get_content',
    domain: 'files',
    description: 'Read a Google Drive file and return text for summarization',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'DriveContentResult',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'read_drive_file',
        executionTool: 'drive.get_content',
        permissions: ['drive.read'],
      },
    ],
  },
  {
    id: 'messaging.search_messages',
    domain: 'messaging',
    description: 'Search stored WhatsApp message history',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'MessagingSearchResult',
    providers: [
      {
        providerId: 'whatsapp',
        adapterAction: 'search_messages',
        executionTool: 'whatsapp.search_messages',
        permissions: ['whatsapp.read'],
      },
    ],
  },
  {
    id: 'messaging.search_chats',
    domain: 'messaging',
    description: 'Search WhatsApp chats by contact name or phone number',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'MessagingChatSearchResult',
    providers: [
      {
        providerId: 'whatsapp',
        adapterAction: 'search_chats',
        executionTool: 'whatsapp.search_chats',
        permissions: ['whatsapp.read'],
      },
    ],
  },
  {
    id: 'resources.search',
    domain: 'files',
    description: 'Search across WhatsApp, email index, and Google Drive',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'ResourceSearchResult',
    providers: [
      {
        providerId: 'platform',
        adapterAction: 'search',
        executionTool: 'resources.search',
        permissions: [],
      },
    ],
  },
  {
    id: 'contacts.resolve_person',
    domain: 'contacts',
    description: 'Resolve a person name to preferred messaging or email address',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: false,
    resultSchema: 'ContactResolveResult',
    providers: [
      {
        providerId: 'platform',
        adapterAction: 'resolve',
        executionTool: 'contacts.resolve',
        permissions: [],
      },
    ],
  },
  {
    id: 'communication.email.search',
    domain: 'email',
    description: 'Search email (legacy)',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: false,
    resultSchema: 'Legacy',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'search',
        executionTool: 'gmail.search',
        permissions: ['gmail.read'],
      },
    ],
  },
  {
    id: 'communication.email.send',
    domain: 'email',
    description: 'Send email (legacy)',
    risk: 'high',
    requiresConfirmation: true,
    plannerVisible: false,
    resultSchema: 'Legacy',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'send',
        executionTool: 'gmail.send',
        permissions: ['gmail.send'],
      },
    ],
  },
  {
    id: 'communication.message.send',
    domain: 'messaging',
    description: 'Send message (legacy)',
    risk: 'high',
    requiresConfirmation: true,
    plannerVisible: false,
    resultSchema: 'Legacy',
    providers: [
      {
        providerId: 'whatsapp',
        adapterAction: 'send_message',
        executionTool: 'whatsapp.send_message',
        permissions: ['whatsapp.send'],
      },
    ],
  },
  {
    id: 'communication.chat.search',
    domain: 'messaging',
    description: 'Search chats (legacy)',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: true,
    resultSchema: 'Legacy',
    providers: [
      {
        providerId: 'whatsapp',
        adapterAction: 'search_chats',
        executionTool: 'whatsapp.search_chats',
        permissions: ['whatsapp.read'],
      },
    ],
  },
  {
    id: 'productivity.calendar.create',
    domain: 'calendar',
    description: 'Create event (legacy)',
    risk: 'high',
    requiresConfirmation: true,
    plannerVisible: false,
    resultSchema: 'Legacy',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'create_event',
        executionTool: 'calendar.create_event',
        permissions: ['calendar.write'],
      },
    ],
  },
  {
    id: 'productivity.calendar.list',
    domain: 'calendar',
    description: 'List events (legacy)',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: false,
    resultSchema: 'Legacy',
    providers: [
      {
        providerId: 'google',
        adapterAction: 'list',
        executionTool: 'calendar.list',
        permissions: ['calendar.read'],
      },
    ],
  },
  {
    id: 'productivity.note.create',
    domain: 'notes',
    description: 'Create note',
    risk: 'low',
    requiresConfirmation: true,
    plannerVisible: false,
    resultSchema: 'Legacy',
    providers: [
      {
        providerId: 'notes',
        adapterAction: 'create',
        executionTool: 'notes.create',
        permissions: ['notes.write'],
      },
    ],
  },
  {
    id: 'productivity.note.search',
    domain: 'notes',
    description: 'Search notes',
    risk: 'low',
    requiresConfirmation: false,
    plannerVisible: false,
    resultSchema: 'Legacy',
    providers: [
      {
        providerId: 'notes',
        adapterAction: 'search',
        executionTool: 'notes.search',
        permissions: ['notes.read'],
      },
    ],
  },
];

export function getPlannerVisibleCapabilities(): CapabilitySourceEntry[] {
  return CAPABILITY_SOURCE.filter((c) => c.plannerVisible);
}
