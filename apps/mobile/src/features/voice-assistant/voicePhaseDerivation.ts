import type { VoiceAssistantPhase } from './useVoiceAssistantSession';

export const AGENT_CONNECT_TIMEOUT_MS = 12_000;

export function deriveClientPhase(params: {
  isActive: boolean;
  sawAgentSignal: boolean;
  isStreaming: boolean;
  isGenerating: boolean;
  agentPhase: VoiceAssistantPhase | null;
  currentPhase: VoiceAssistantPhase;
}): VoiceAssistantPhase | null {
  if (!params.isActive || !params.sawAgentSignal) return null;

  if (params.isStreaming || params.isGenerating) {
    return 'waiting_for_ai';
  }

  if (params.agentPhase && params.agentPhase !== 'waiting_for_ai') {
    return params.agentPhase;
  }

  if (params.currentPhase === 'waiting_for_ai') {
    return params.agentPhase ?? 'listening';
  }

  return null;
}
