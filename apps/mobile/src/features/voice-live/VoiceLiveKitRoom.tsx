import type { ReactNode } from 'react';
import { LiveKitRoom } from '@livekit/react-native';
import type { LiveKitTokenResponse } from '@ai-assistant/types';
import { VoiceLiveKitPhaseBridge } from './VoiceLiveKitPhaseBridge';
import { VoiceAudioOutputBootstrap } from './VoiceAudioOutputBootstrap';
import type { VoiceAssistantPhase } from '@/features/voice-assistant/useVoiceAssistantSession';

type Props = {
  tokenInfo: LiveKitTokenResponse | null;
  isActive?: boolean;
  onAgentPhase?: (phase: VoiceAssistantPhase) => void;
  onAgentTranscript?: (text: string) => void;
  onUserTranscript?: (text: string) => void;
  onMessagesTick?: (tickValue?: string) => void;
  onDisconnected?: () => void;
  children: ReactNode;
};

export function VoiceLiveKitRoom({
  tokenInfo,
  isActive = false,
  onAgentPhase,
  onAgentTranscript,
  onUserTranscript,
  onMessagesTick,
  onDisconnected,
  children,
}: Props) {
  return (
    <>
      {tokenInfo ? (
        <LiveKitRoom
          serverUrl={tokenInfo.livekitUrl}
          token={tokenInfo.token}
          connect
          audio
          video={false}
          onDisconnected={onDisconnected}
        >
          {onAgentPhase ? (
            <VoiceLiveKitPhaseBridge
              isActive={isActive}
              onPhase={onAgentPhase}
              onAgentTranscript={onAgentTranscript}
              onUserTranscript={onUserTranscript}
              onMessagesTick={onMessagesTick}
            />
          ) : null}
          <VoiceAudioOutputBootstrap enabled={isActive} />
        </LiveKitRoom>
      ) : null}
      {children}
    </>
  );
}
