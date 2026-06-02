export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export type ChatSessionKind = 'text' | 'voice';

import type { ChatAttachmentRef } from './attachments';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  attachments?: ChatAttachmentRef[];
}

export interface ChatSession {
  id: string;
  title: string | null;
  kind: ChatSessionKind;
  messageCount?: number;
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
