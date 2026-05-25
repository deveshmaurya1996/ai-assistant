export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export type ChatSessionKind = 'text' | 'voice';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
  kind: ChatSessionKind;
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
