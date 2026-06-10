import {
  useChatStreamStore,
  resolveStreamSessionKey,
  selectSessionStream,
} from './chatStreamStore';

export type ChatStreamViewState = {
  streamKey: string;
  streamText: string;
  isGenerating: boolean;
  isImageGenerating: boolean;
  streamStatusMessage: string | null;
  revision: number;
  showStreamBubble: boolean;
};

type UseChatStreamStateOptions = {
  isolateCompose?: boolean;
};

export function useChatStreamState(
  sessionId: string | null | undefined,
  options?: UseChatStreamStateOptions
): ChatStreamViewState {
  const boundTurnSessionId = useChatStreamStore((s) => s.boundTurnSessionId);
  const streamOptions = options?.isolateCompose
    ? { isolateCompose: true as const }
    : undefined;
  const streamKey = resolveStreamSessionKey(
    sessionId,
    boundTurnSessionId,
    streamOptions
  );

  const stream = useChatStreamStore((s) =>
    selectSessionStream(s.sessions, sessionId, boundTurnSessionId, streamOptions)
  );

  const streamText = stream?.streamText ?? '';
  const isGenerating = stream?.isGenerating ?? false;
  const isImageGenerating = stream?.isImageGenerating ?? false;
  const streamStatusMessage = stream?.statusMessage ?? null;
  const revision = stream?.revision ?? 0;
  const showStreamBubble = isGenerating || Boolean(streamText.trim());

  return {
    streamKey,
    streamText,
    isGenerating,
    isImageGenerating,
    streamStatusMessage,
    revision,
    showStreamBubble,
  };
}
