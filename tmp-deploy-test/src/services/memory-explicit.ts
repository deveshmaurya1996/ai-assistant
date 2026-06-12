
const SAVE_INTENT_CUES =
  /\b(remember|save this|keep this|store this|don't forget|do not forget|for future|my resume)\b/i;

const RETRIEVAL_ONLY =
  /^\s*(do you remember|did you remember|what do you remember|can you remember)\b/i;

const EXPLICIT_PAYLOAD_PATTERNS: RegExp[] = [
  /^\s*remember\s*:\s*(.+)/is,
  /^\s*remember\s+that\s+(.+)/is,
  /^\s*save\s+this\s*:\s*(.+)/is,
  /^\s*keep\s+this\s*:\s*(.+)/is,
  /^\s*store\s+this\s*:\s*(.+)/is,
  /^\s*don'?t\s+forget\s*:\s*(.+)/is,
  /^\s*do\s+not\s+forget\s*:\s*(.+)/is,
];

const FILLER_ONLY = /^(this|that|it|the above|above)$/i;

function cleanPayload(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 3 || FILLER_ONLY.test(text)) return null;
  return text;
}

export function isExplicitRememberIntent(text: string): boolean {
  const trimmed = (text ?? '').trim();
  if (!trimmed || RETRIEVAL_ONLY.test(trimmed)) return false;
  if (/\bremind\s+me\b/i.test(trimmed)) return false;
  return SAVE_INTENT_CUES.test(trimmed);
}

export function parseExplicitRememberContent(text: string): string | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed || RETRIEVAL_ONLY.test(trimmed)) return null;

  for (const pattern of EXPLICIT_PAYLOAD_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const payload = cleanPayload(match[1]);
      if (payload) return payload;
    }
  }

  return null;
}
