import { ApiError } from '@ai-assistant/sdk';

export type VoiceAiStep = 'transcription' | 'chat' | 'speech';

const STEP_HINTS: Record<VoiceAiStep, string> = {
  transcription:
    'Uses AI service /v1/voice/transcribe (whisper-1 or pollinations/whisper-1). Set OPENAI_API_KEY or POLLINATIONS_API_KEY in .env and restart the AI service.',
  chat:
    'Uses AI service /v1/chat/stream with your Settings preferred model (default gemini/gemini-3.1-pro-preview). Ensure AI service is running on port 8000.',
  speech:
    'Uses AI service /v1/voice/speak (tts-1 or pollinations/openai-audio). Set OPENAI_API_KEY or POLLINATIONS_API_KEY.',
};

function detailText(details: unknown): string {
  if (details == null) return '';
  if (typeof details === 'string') return details.slice(0, 300);
  try {
    return JSON.stringify(details).slice(0, 300);
  } catch {
    return String(details);
  }
}

export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    const extra = detailText(err.details);
    return extra ? `${err.message} — ${extra}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function formatVoiceStepError(step: VoiceAiStep, err: unknown): string {
  const message = formatApiError(err);
  if (isVoiceRateLimitMessage(message)) {
    return message;
  }
  return `${step} failed: ${message}\n${STEP_HINTS[step]}`;
}

export function isVoiceRateLimitMessage(message: string): boolean {
  return /too many voice|too many speech|rate limit/i.test(message);
}

export function isVoiceIdleEndMessage(message: string): boolean {
  return message.startsWith('Voice chat ended');
}

export function formatUserVoiceError(err: unknown): string {
  const message = formatApiError(err);
  if (isVoiceRateLimitMessage(message) || isVoiceIdleEndMessage(message)) {
    return message;
  }
  if (message.includes('STEP_HINTS') || message.includes('failed:')) {
    return message;
  }
  return message.length > 0 ? message : 'Voice session failed';
}

export function formatChatSocketError(payload: {
  error?: string;
  details?: string;
  debug?: string;
}): string {
  const parts = [payload.details, payload.debug, payload.error].filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.join(' — ') || 'Chat failed';
}

export function formatChatStepError(payload: {
  error?: string;
  details?: string;
  debug?: string;
}): string {
  return `chat failed: ${formatChatSocketError(payload)}\n${STEP_HINTS.chat}`;
}
