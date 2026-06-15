const PLACEHOLDER_RECIPIENTS = new Set([
  'contact',
  'recipient',
  'them',
  'him',
  'her',
  'someone',
  'person',
  'user',
]);

const CONTACT_STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'my',
  'on',
  'via',
  'whatsapp',
  'email',
  'gmail',
  'mail',
  'him',
  'her',
  'unread',
  'check',
  'list',
  'show',
  'new',
  'recent',
  'messages',
  'message',
  'inbox',
  'chats',
  'wa',
]);

export function isEmailSendQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (/\b(send|compose|write|draft)\b/i.test(q) && /\b(email|e-mail|gmail)\b/i.test(q)) {
    return true;
  }
  return /\b(send|compose|write|draft)\b/i.test(q) && /\b[\w.+-]+@[\w.-]+\.\w+\b/.test(q);
}

const CONTACT_PATTERNS: RegExp[] = [
  /send(?:\s+a)?\s+message\s+to\s+([A-Za-z][\w\s'.\-]{0,40}?)(?:\s+[:,-]|\s+saying|\s+that|\s*$)/i,
  /send\s+([A-Za-z][\w'.\-]+)(?:\s+[:,-]|\s+(?:a\s+)?message|\s+saying|\s+hello|\s+hi\b)/i,
  /text\s+([A-Za-z][\w'.\-]+)/i,
  /message\s+to\s+([A-Za-z][\w'.\-]+)/i,
  /whatsapp\s+([A-Za-z][\w'.\-]+)/i,
  /(?:^|\s)to\s+([A-Za-z][\w'.\-]+)(?:\s+[:,-]|\s+saying|\s+with|\s*$)/i,
  /(?:^|\s)for\s+([A-Za-z][\w'.\-]+)(?:\s+[:,-]|\s+saying|\s+with|\s*$)/i,
  /send\s+.+\s+to\s+([A-Za-z][\w'.\-]+)\s*$/i,
];

export function isPlaceholderRecipient(value: string | undefined | null): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_RECIPIENTS.has(trimmed.toLowerCase());
}

export function extractContactHintFromQuery(query: string): string | null {
  const q = query.trim();
  if (!q || isEmailSendQuery(q)) return null;

  for (const pattern of CONTACT_PATTERNS) {
    const match = q.match(pattern);
    if (!match?.[1]) continue;
    const name = match[1].trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const lower = name.toLowerCase();
    if (CONTACT_STOP_WORDS.has(lower)) continue;
    if (PLACEHOLDER_RECIPIENTS.has(lower)) continue;
    return name;
  }

  return null;
}

export function resolveRecipientCandidate(
  to: string | undefined,
  originalText?: string
): string {
  const trimmed = to?.trim() ?? '';
  if (!isPlaceholderRecipient(trimmed)) return trimmed;
  if (originalText) {
    const extracted = extractContactHintFromQuery(originalText);
    if (extracted) return extracted;
  }
  return trimmed;
}
