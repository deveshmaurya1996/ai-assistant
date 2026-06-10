import type { ChatAttachmentRef } from './attachments';
import type { ChatMessage } from './chat';

export interface ChatOutgoingPayload {
  text: string;
  chatSessionId?: string;
  confirmed?: boolean;
  ragEnabled?: boolean;
  source?: 'chat' | 'voice';
  attachments?: ChatAttachmentRef[];
  personalityId?: string;
  assistantDisplayName?: string;
  timezone?: string;
}

export interface ChatChunkPayload {
  chunk: string;
  chatSessionId: string;
}

export interface ChatStatusPayload {
  chatSessionId: string;
  message: string;
}

export interface ChatEndPayload {
  message: ChatMessage;
  chatSessionId: string;
  modelUsed?: string;
  modelLabel?: string;
}

export interface ChatTitleUpdatedPayload {
  chatSessionId: string;
  title: string;
}

export interface ChatAbortPayload {
  chatSessionId?: string;
}

export interface ChatAbortedPayload {
  chatSessionId: string;
}

export interface ChatErrorPayload {
  error: string;
  details?: string;
  debug?: string;
  chatSessionId?: string;
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

export interface ToolStartPayload {
  executionId: string;
  tool: string;
}

export interface ToolProgressPayload {
  executionId: string;
  tool: string;
  message?: string;
  progress?: number;
}

export interface ToolCompletePayload {
  executionId: string;
  tool: string;
  result?: unknown;
}

export interface ToolFailedPayload {
  executionId: string;
  tool: string;
  error?: string;
}

export interface ActionConfirmRequiredPayload {
  executionId?: string;
  tool: string;
  args: Record<string, unknown>;
  preview?: unknown;
}

export interface NotificationCreatedPayload {
  userId?: string;
  title: string;
  body?: string;
  type?: string;
  reminderId?: string;
  missed?: boolean;
}

export interface VoiceInterruptedPayload {
  sessionId?: string;
}

export interface ServerToClientEvents {
  authenticated: (data: { userId: string }) => void;
  unauthorized: (data: { error: string }) => void;
  'chat:chunk': (data: ChatChunkPayload) => void;
  'chat:status': (data: ChatStatusPayload) => void;
  'chat:end': (data: ChatEndPayload) => void;
  'chat:message_saved': (data: { message: ChatMessage }) => void;
  'chat:session_created': (data: { chatSessionId: string }) => void;
  'chat:title_updated': (data: ChatTitleUpdatedPayload) => void;
  'chat:aborted': (data: ChatAbortedPayload) => void;
  'chat:error': (data: ChatErrorPayload) => void;
  'voice:partial': (data: VoicePartialPayload) => void;
  'voice:processing': (data: VoiceProcessingPayload) => void;
  'voice:final': (data: VoiceFinalPayload) => void;
  'voice:error': (data: VoiceErrorPayload) => void;
  'tool:start': (data: ToolStartPayload) => void;
  'tool:progress': (data: ToolProgressPayload) => void;
  'tool:complete': (data: ToolCompletePayload) => void;
  'tool:failed': (data: ToolFailedPayload) => void;
  'chat:action_confirm_required': (data: ActionConfirmRequiredPayload) => void;
  'notification:created': (data: NotificationCreatedPayload) => void;
  'voice:interrupted': (data: VoiceInterruptedPayload) => void;
}

export interface ClientToServerEvents {
  authenticate: (token: string) => void;
  'chat:message': (data: ChatOutgoingPayload) => void;
  'chat:abort': (data: ChatAbortPayload) => void;
  'voice:turn_start': (data: VoiceTurnStartPayload) => void;
  'voice:turn_audio': (data: VoiceTurnAudioPayload) => void;
  'voice:turn_end': (data: VoiceTurnEndPayload) => void;
  'voice:turn_cancel': (data: VoiceTurnCancelPayload) => void;
  'execution:cancel': (data: { executionId: string }) => void;
  'voice:interrupt': (data: { sessionId?: string; executionId?: string }) => void;
}
