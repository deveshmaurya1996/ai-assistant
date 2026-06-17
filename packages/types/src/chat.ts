export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export type ChatSessionKind = 'text' | 'voice';

import type { ChatAttachmentRef } from './attachments';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  attachments?: ChatAttachmentRef[];
  personalityId?: string;
  assistantDisplayName?: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
  kind: ChatSessionKind;
  messageCount?: number;
  hasUnread?: boolean;
  personalityId?: string;
  assistantDisplayName?: string;
}

export interface CreateChatSessionResponse {
  id: string;
  title: string | null;
  kind: ChatSessionKind;
}

export interface CreateChatSessionBody {
  title?: string;
  kind?: ChatSessionKind;
}

export interface ListChatSessionsResponse {
  sessions: ChatSession[];
  nextCursor: string | null;
}

export interface UpdateChatSessionBody {
  title: string;
}
