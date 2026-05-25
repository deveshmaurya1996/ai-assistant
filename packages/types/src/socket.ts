import type { ChatMessage } from './chat';

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

export interface ChatTitleUpdatedPayload {
  chatSessionId: string;
  title: string;
}

export interface ChatErrorPayload {
  error: string;
  details?: string;
  debug?: string;
}

export interface VoiceTurnStartPayload {
  chatSessionId: string;
  turnId: string;
}

export interface VoiceTurnAudioPayload {
  turnId: string;
  seq: number;
  mime: string;
  chunk: string;
}

export interface VoiceTurnEndPayload {
  turnId: string;
}

export interface VoiceTurnCancelPayload {
  turnId: string;
}

export interface VoicePartialPayload {
  turnId: string;
  text: string;
}

export interface VoiceFinalPayload {
  turnId: string;
  text: string;
}

export interface VoiceProcessingPayload {
  turnId: string;
}

export interface VoiceErrorPayload {
  turnId: string;
  error: string;
  details?: string;
}

export interface ServerToClientEvents {
  authenticated: (data: { userId: string }) => void;
  unauthorized: (data: { error: string }) => void;
  'chat:chunk': (data: ChatChunkPayload) => void;
  'chat:end': (data: ChatEndPayload) => void;
  'chat:message_saved': (data: { message: ChatMessage }) => void;
  'chat:session_created': (data: { chatSessionId: string }) => void;
  'chat:title_updated': (data: ChatTitleUpdatedPayload) => void;
  'chat:error': (data: ChatErrorPayload) => void;
  'voice:partial': (data: VoicePartialPayload) => void;
  'voice:processing': (data: VoiceProcessingPayload) => void;
  'voice:final': (data: VoiceFinalPayload) => void;
  'voice:error': (data: VoiceErrorPayload) => void;
}

export interface ClientToServerEvents {
  authenticate: (token: string) => void;
  'chat:message': (data: ChatOutgoingPayload) => void;
  'voice:turn_start': (data: VoiceTurnStartPayload) => void;
  'voice:turn_audio': (data: VoiceTurnAudioPayload) => void;
  'voice:turn_end': (data: VoiceTurnEndPayload) => void;
  'voice:turn_cancel': (data: VoiceTurnCancelPayload) => void;
}
