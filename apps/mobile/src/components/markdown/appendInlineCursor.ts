
export function appendInlineCursor(markdown: string): string {
  const trimmed = markdown.replace(/\n+$/, '');
  if (!trimmed) return '\u258F';
  return `${trimmed}\u00A0\u258F`;
}
