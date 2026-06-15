import { ApiError } from '@ai-assistant/sdk';

export type VoiceAiStep = 'transcription' | 'chat' | 'speech';

const STEP_HINTS: Record<VoiceAiStep, string> = {
  transcription:
    'Uses /v1/voice/transcribe (ffmpeg → WAV → NVIDIA STT or Pollinations Whisper). Requires ffmpeg on ai-runtime and NVIDIA_API_KEY or POLLINATIONS_API_KEY in .env.',
  chat:
    'Uses NVIDIA NIM via /v1/chat/stream (auto-routed from planner-config/ai-models.yaml). Set NVIDIA_API_KEY and restart ai-runtime.',
  speech:
    'Uses Pollinations TTS via /v1/voice/speak. Set POLLINATIONS_API_KEY in .env.',
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

function unwrapErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message && !parts.includes(cause.message)) {
    parts.push(cause.message);
  } else if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const msg = String((cause as { message: unknown }).message);
    if (msg && !parts.includes(msg)) parts.push(msg);
  }
  return parts.join(': ');
}

function isNetworkFetchError(message: string): boolean {
  return /fetch failed|network request failed|unexpected end of stream|failed to connect|connection refused/i.test(
    message
  );
}

export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    const extra = detailText(err.details);
    return extra ? `${err.message} — ${extra}` : err.message;
  }
  const message = unwrapErrorMessage(err);
  if (isNetworkFetchError(message)) {
    return `${message} — is the API running? (pnpm dev) On Android with localhost, run: pnpm --filter @ai-assistant/mobile adb-reverse`;
  }
  return message;
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
