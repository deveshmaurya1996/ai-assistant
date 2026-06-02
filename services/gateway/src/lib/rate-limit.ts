import { tooManyRequests } from './errors';

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

const ONE_MIN_MS = 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

export type RateLimitTier =
  | 'ip_global'
  | 'ip_auth'
  | 'user_authenticated'
  | 'user_ai_heavy'
  | 'socket_chat'
  | 'voice_transcribe'
  | 'voice_speak';

export type RateLimitSpec = { max: number; windowMs: number };

export const RATE_LIMITS: Record<RateLimitTier, RateLimitSpec> = {
  ip_global: {
    max: envInt('RATE_LIMIT_IP_GLOBAL_MAX', 300),
    windowMs: envInt('RATE_LIMIT_IP_GLOBAL_WINDOW_MS', FIFTEEN_MIN_MS),
  },
  ip_auth: {
    max: envInt('RATE_LIMIT_IP_AUTH_MAX', 40),
    windowMs: envInt('RATE_LIMIT_IP_AUTH_WINDOW_MS', ONE_MIN_MS),
  },
  user_authenticated: {
    max: envInt('RATE_LIMIT_USER_API_MAX', 500),
    windowMs: envInt('RATE_LIMIT_USER_API_WINDOW_MS', FIFTEEN_MIN_MS),
  },
  user_ai_heavy: {
    max: envInt('RATE_LIMIT_USER_AI_MAX', 80),
    windowMs: envInt('RATE_LIMIT_USER_AI_WINDOW_MS', FIFTEEN_MIN_MS),
  },
  socket_chat: {
    max: envInt('RATE_LIMIT_SOCKET_CHAT_MAX', 60),
    windowMs: envInt('RATE_LIMIT_SOCKET_CHAT_WINDOW_MS', FIFTEEN_MIN_MS),
  },
  voice_transcribe: {
    max: envInt('RATE_LIMIT_VOICE_TRANSCRIBE_MAX', 30),
    windowMs: envInt('RATE_LIMIT_VOICE_TRANSCRIBE_WINDOW_MS', TEN_MIN_MS),
  },
  voice_speak: {
    max: envInt('RATE_LIMIT_VOICE_SPEAK_MAX', 60),
    windowMs: envInt('RATE_LIMIT_VOICE_SPEAK_WINDOW_MS', TEN_MIN_MS),
  },
};

const TIER_MESSAGES: Partial<Record<RateLimitTier, string>> = {
  ip_global: 'Too many requests from this network. Please try again later.',
  ip_auth: 'Too many authentication attempts. Please wait and try again.',
  user_authenticated: 'Too many API requests. Please slow down and try again.',
  user_ai_heavy: 'Too many AI requests. Please wait a few minutes.',
  socket_chat: 'Too many chat messages. Please wait a few minutes.',
  voice_transcribe: 'Too many voice transcriptions. Please wait a few minutes.',
  voice_speak: 'Too many speech requests. Please wait a few minutes.',
};

const EXEMPT_PATH_PREFIXES = ['/health', '/metrics'] as const;

function maybePruneWindows(): void {
  if (Math.random() > 0.01) return;
  const now = Date.now();
  for (const [key, bucket] of windows) {
    if (now >= bucket.resetAt) {
      windows.delete(key);
    }
  }
}

function bucketKey(subject: string, tier: RateLimitTier): string {
  return `${tier}:${subject}`;
}

export type RateLimitCheck = {
  allowed: boolean;
  retryAfterSec?: number;
};

export function checkRateLimit(subject: string, tier: RateLimitTier): RateLimitCheck {
  maybePruneWindows();
  const spec = RATE_LIMITS[tier];
  const key = bucketKey(subject, tier);
  const now = Date.now();

  let bucket = windows.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + spec.windowMs };
    windows.set(key, bucket);
  }

  if (bucket.count >= spec.max) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  bucket.count += 1;
  return { allowed: true };
}

export function rateLimitMessage(tier: RateLimitTier): string {
  return TIER_MESSAGES[tier] ?? 'Too many requests. Please try again later.';
}

export function enforceRateLimit(subject: string, tier: RateLimitTier): void {
  const result = checkRateLimit(subject, tier);
  if (!result.allowed) {
    throw tooManyRequests(rateLimitMessage(tier));
  }
}

export function enforceRateLimits(
  subject: string,
  tiers: readonly RateLimitTier[]
): void {
  for (const tier of tiers) {
    enforceRateLimit(subject, tier);
  }
}

export function getRetryAfterSec(subject: string, tier: RateLimitTier): number | undefined {
  const key = bucketKey(subject, tier);
  const bucket = windows.get(key);
  if (!bucket) return undefined;
  const remaining = bucket.resetAt - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : undefined;
}

export function isRateLimitExemptPath(pathname: string): boolean {
  return EXEMPT_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function resolveHttpRateLimitTiers(method: string, url: string): RateLimitTier[] {
  const pathname = url.split('?')[0] ?? url;

  if (isRateLimitExemptPath(pathname)) {
    return [];
  }

  if (pathname.startsWith('/api/auth')) {
    return ['ip_auth'];
  }

  const tiers: RateLimitTier[] = ['ip_global'];
  const upper = method.toUpperCase();

  if (pathname.startsWith('/voice/transcribe') && upper === 'POST') {
    tiers.push('voice_transcribe');
    return tiers;
  }

  if (pathname.startsWith('/voice/speak') && upper === 'POST') {
    tiers.push('voice_speak');
    return tiers;
  }

  const isAiHeavy =
    (pathname.startsWith('/image') && upper === 'POST') ||
    (pathname === '/agents/run' && upper === 'POST') ||
    (/^\/automations\/[^/]+\/run$/.test(pathname) && upper === 'POST');

  if (isAiHeavy) {
    tiers.push('user_ai_heavy');
    return tiers;
  }

  const isProtectedApi =
    pathname.startsWith('/chat') ||
    pathname.startsWith('/memory') ||
    pathname.startsWith('/agents') ||
    pathname.startsWith('/automations') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/voice');

  if (isProtectedApi) {
    tiers.push('user_authenticated');
  }

  return tiers;
}

export function resolveSocketRateLimitTiers(
  event: 'chat:message' | 'voice:turn_end'
): RateLimitTier[] {
  switch (event) {
    case 'chat:message':
      return ['socket_chat', 'user_ai_heavy'];
    case 'voice:turn_end':
      return ['voice_transcribe'];
    default:
      return [];
  }
}

export function enforceSocketRateLimits(
  clientIp: string,
  userId: string,
  event: 'chat:message' | 'voice:turn_end'
): void {
  enforceRateLimit(clientIp, 'ip_global');
  enforceRateLimits(userId, resolveSocketRateLimitTiers(event));
}

export function getClientIp(
  headers: Record<string, string | string[] | undefined> | undefined
): string {
  if (!headers) return 'unknown';
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  return 'unknown';
}

export const VOICE_TRANSCRIBE_LIMIT = RATE_LIMITS.voice_transcribe;
export const VOICE_SPEAK_LIMIT = RATE_LIMITS.voice_speak;

export function enforceUserRateLimit(
  userId: string,
  action: 'voice_transcribe' | 'voice_speak',
  _max?: number,
  _windowMs?: number
): void {
  enforceRateLimit(userId, action);
}
