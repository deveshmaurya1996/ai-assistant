export type InlinePart = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; parts: InlinePart[] }
  | { type: 'bullet'; parts: InlinePart[]; ordered?: boolean; index?: number }
  | { type: 'paragraph'; parts: InlinePart[] }
  | { type: 'spacer' };

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^[*\-]\s+(.*)$/;
const ORDERED_RE = /^(\d+)\.\s+(.*)$/;

export function parseInlineMarkdown(text: string): InlinePart[] {
  if (!text) return [];

  const parts: InlinePart[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push({ text: token.slice(1, -1), italic: true });
    } else {
      parts.push({ text: token });
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    parts.push({ text: text.slice(last) });
  }

  return parts.length ? parts : [{ text }];
}

export function parseChatMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      if (blocks.length && blocks[blocks.length - 1]?.type !== 'spacer') {
        blocks.push({ type: 'spacer' });
      }
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({
        type: 'heading',
        level,
        parts: parseInlineMarkdown(heading[2].trim()),
      });
      continue;
    }

    const ordered = line.match(ORDERED_RE);
    if (ordered) {
      blocks.push({
        type: 'bullet',
        ordered: true,
        index: Number(ordered[1]),
        parts: parseInlineMarkdown(ordered[2].trim()),
      });
      continue;
    }

    const bullet = line.match(BULLET_RE);
    if (bullet) {
      blocks.push({
        type: 'bullet',
        parts: parseInlineMarkdown(bullet[1].trim()),
      });
      continue;
    }

    blocks.push({ type: 'paragraph', parts: parseInlineMarkdown(line.trim()) });
  }

  while (blocks.length && blocks[blocks.length - 1]?.type === 'spacer') {
    blocks.pop();
  }

  return blocks;
}
