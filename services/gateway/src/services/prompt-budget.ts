/** Prompt and routing size limits for attachment turns. */

export function envInt(name: string, fallback: number, max = 50_000): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

export function routingQueryMaxChars(): number {
  return envInt('ROUTING_QUERY_MAX_CHARS', 512, 2000);
}

export function attachmentUserQueryMaxChars(): number {
  return envInt('ATTACHMENT_USER_QUERY_MAX_CHARS', 2000, 20_000);
}

export function attachmentFileContextMaxChars(): number {
  return envInt('ATTACHMENT_FILE_CONTEXT_MAX_CHARS', 8000, 50_000);
}

export function attachmentHistoryLimit(): number {
  return envInt('ATTACHMENT_HISTORY_LIMIT', 8, 50);
}

export function attachmentExcerptSkipRetrievalThreshold(): number {
  return envInt('ATTACHMENT_EXCERPT_SKIP_RETRIEVAL_CHARS', 2000, 20_000);
}

export function routingQueryFromText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const para = trimmed.split(/\n\n+/)[0]?.trim() ?? trimmed;
  const limit = routingQueryMaxChars();
  if (para.length <= limit) return para;
  return trimmed.slice(0, limit);
}

export function truncateForPrompt(value: string, maxChars: number): string {
  const s = value.trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n…(truncated)`;
}

export function capAttachmentUserQuery(text: string): string {
  return truncateForPrompt(text, attachmentUserQueryMaxChars());
}
