
export interface UploadFilePayload {
  uri: string;
  name: string;
  type: string;
}

export interface VoiceTranscriptionResponse {
  text: string;
}

export type VoiceResponseStyle = 'concise' | 'detailed' | 'coaching';

export interface VoiceProfile {
  id: string;
  label: string;
  sttProvider: string;
  ttsProvider: string;
  voiceId: string;
  personalityId: string;
  responseStyle: VoiceResponseStyle;
  speakingRate: number;
  maxSentences: number;
}

export interface VoiceSessionState {
  roomId: string;
  chatSessionId: string;
  userId: string;
  voiceProfileId: string;
  activeTurnId: string | null;
  startedAt: string;
  lastActivityAt: string;
  lastAnalytics?: VoiceTurnAnalytics;
}

export interface VoiceTurnAnalytics {
  turnId: string;
  sttLatencyMs: number;
  gatewayLatencyMs: number;
  plannerLatencyMs: number;
  toolLatencyMs: number;
  llmFirstTokenMs: number;
  ttsFirstByteMs: number;
  totalLatencyMs: number;
}

export interface VoiceSessionContext {
  rollingSummary: string;
  summarizedThroughMessageId: string;
  turnCount: number;
  totalVoiceDurationMs?: number;
}

export interface LiveKitTokenResponse {
  token: string;
  roomName: string;
  chatSessionId: string;
  livekitUrl: string;
  voiceProfileId: string;
  expiresAt: string;
  resumed: boolean;
  profile?: {
    id: string;
    label: string;
    sttProvider: string;
    ttsProvider: string;
  };
}

export interface VoiceProfileListResponse {
  profiles: Array<Pick<VoiceProfile, 'id' | 'label' | 'responseStyle' | 'speakingRate'>>;
  defaultProfileId: string;
}

export type UserVoiceSettings = {
  voiceProfileId?: string;
  prefersShortAnswers?: boolean;
  language?: string;
  speakingRate?: number;
};
