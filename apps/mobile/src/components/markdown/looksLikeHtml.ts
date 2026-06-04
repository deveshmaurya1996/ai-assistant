
export function looksLikeHtml(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;

  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return true;
  }

  if (/```/.test(trimmed)) return false;
  if (/^#{1,6}\s/m.test(trimmed)) return false;
  if (/^\s*[-*+]\s/m.test(trimmed) || /^\s*\d+\.\s/m.test(trimmed)) return false;
  if (/^\s*>/m.test(trimmed)) return false;

  const prose = trimmed
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '');

  if (!/<[a-z!?/]/i.test(prose)) return false;

  const hasClosingTag = /<\/[a-z][\w:-]*\s*>/i.test(prose);
  const blockOpens = prose.match(
    /<(html|body|head|main|article|section|div|p|ul|ol|table)\b[\s/>]/gi
  );
  if (blockOpens && blockOpens.length >= 2 && hasClosingTag) return true;

  if (/^<(?:!DOCTYPE|html|body|head|main|div|p)\b/i.test(prose) && hasClosingTag) {
    return true;
  }

  return false;
}
