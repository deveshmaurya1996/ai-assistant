import type { ChatMessage } from '@ai-assistant/types/chat';
import { STREAMING_MESSAGE_ID } from './buildStreamingMessages';
import { LEGACY_ASSISTANT_LABEL } from './chatRoutes';

export function messageAssistantLabel(
  message: ChatMessage,
  streamingAssistantLabel?: string
): string | undefined {
  if (message.role !== 'ASSISTANT') return undefined;
  if (message.id === STREAMING_MESSAGE_ID) {
    return streamingAssistantLabel;
  }
  return message.assistantDisplayName ?? LEGACY_ASSISTANT_LABEL;
}
