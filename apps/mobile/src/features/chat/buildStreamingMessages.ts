import type { ChatMessage } from '@ai-assistant/sdk';

export const STREAMING_MESSAGE_ID = 'stream';

export function buildStreamingMessages(
  messages: ChatMessage[],
  visibleText: string,
  isStreaming: boolean,
  isGenerating = false
): ChatMessage[] {
  if (!isStreaming && !isGenerating) {
    return messages;
  }

  return [
    ...messages,
    {
      id: STREAMING_MESSAGE_ID,
      role: 'ASSISTANT',
      content: visibleText,
    },
  ];
}
