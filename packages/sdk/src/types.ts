import type { Socket } from 'socket.io-client';

export type MessageRole = 'USER' | 'ASSISTANT';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface ModelsResponse {
  models: ModelInfo[];
  primary: string;
  fallback: string;
}

export interface UploadFilePayload {
  uri: string;
  name: string;
  type: string;
}

export interface ChatOutgoingPayload {
  text: string;
  chatSessionId?: string;
  ragEnabled?: boolean;
}

export interface ChatChunkPayload {
  chunk: string;
  chatSessionId: string;
}

export interface ChatEndPayload {
  message: ChatMessage;
  chatSessionId: string;
}

export interface ServerToClientEvents {
  authenticated: (data: { userId: string }) => void;
  unauthorized: (data: { error: string }) => void;
  'chat:chunk': (data: ChatChunkPayload) => void;
  'chat:end': (data: ChatEndPayload) => void;
  'chat:message_saved': (data: { message: ChatMessage }) => void;
  'chat:session_created': (data: { chatSessionId: string }) => void;
  'chat:error': (data: { error: string; details?: string; debug?: string }) => void;
}

export interface ClientToServerEvents {
  authenticate: (token: string) => void;
  'chat:message': (data: ChatOutgoingPayload) => void;
}

export type AssistantSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
