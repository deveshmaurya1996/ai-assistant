export type VoiceSessionState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'CONFIRMING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR';

export type VoiceSessionEvent =
  | { type: 'START' }
  | { type: 'SPEECH_END' }
  | { type: 'TRANSCRIPT_READY' }
  | { type: 'CONFIRM_REQUIRED' }
  | { type: 'CONFIRMED' }
  | { type: 'TOOL_START' }
  | { type: 'TOOL_END' }
  | { type: 'SPEAK_START' }
  | { type: 'SPEAK_END' }
  | { type: 'INTERRUPT' }
  | { type: 'ERROR' }
  | { type: 'RESET' };

export function voiceSessionReducer(
  state: VoiceSessionState,
  event: VoiceSessionEvent
): VoiceSessionState {
  switch (state) {
    case 'IDLE':
      if (event.type === 'START') return 'LISTENING';
      if (event.type === 'ERROR') return 'ERROR';
      return state;
    case 'LISTENING':
      if (event.type === 'SPEECH_END') return 'PROCESSING';
      if (event.type === 'INTERRUPT') return 'INTERRUPTED';
      if (event.type === 'ERROR') return 'ERROR';
      return state;
    case 'PROCESSING':
      if (event.type === 'TRANSCRIPT_READY') return 'CONFIRMING';
      if (event.type === 'CONFIRMED') return 'EXECUTING';
      if (event.type === 'TOOL_START') return 'EXECUTING';
      if (event.type === 'INTERRUPT') return 'INTERRUPTED';
      if (event.type === 'ERROR') return 'ERROR';
      return state;
    case 'CONFIRMING':
      if (event.type === 'CONFIRMED') return 'EXECUTING';
      if (event.type === 'INTERRUPT') return 'INTERRUPTED';
      if (event.type === 'RESET') return 'IDLE';
      return state;
    case 'EXECUTING':
      if (event.type === 'TOOL_END') return 'SPEAKING';
      if (event.type === 'SPEAK_START') return 'SPEAKING';
      if (event.type === 'INTERRUPT') return 'INTERRUPTED';
      if (event.type === 'ERROR') return 'ERROR';
      return state;
    case 'SPEAKING':
      if (event.type === 'SPEAK_END') return 'LISTENING';
      if (event.type === 'INTERRUPT') return 'INTERRUPTED';
      if (event.type === 'RESET') return 'IDLE';
      return state;
    case 'INTERRUPTED':
      if (event.type === 'RESET' || event.type === 'START') return 'IDLE';
      return state;
    case 'ERROR':
      if (event.type === 'RESET') return 'IDLE';
      return state;
    default:
      return state;
  }
}
