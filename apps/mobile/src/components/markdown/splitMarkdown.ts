export type MarkdownSegment =
  | { kind: 'prose'; text: string }
  | { kind: 'code'; text: string; language?: string };

const FENCE_OPEN_RE = /^```([^\n`]*)(?:\n|$)/;

export function splitMarkdownSegments(content: string): MarkdownSegment[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const segments: MarkdownSegment[] = [];
  let i = 0;

  while (i < normalized.length) {
    const fenceStart = normalized.indexOf('```', i);
    if (fenceStart === -1) {
      const tail = normalized.slice(i);
      if (tail) segments.push({ kind: 'prose', text: tail });
      break;
    }

    if (fenceStart > i) {
      segments.push({ kind: 'prose', text: normalized.slice(i, fenceStart) });
    }

    const opener = normalized.slice(fenceStart).match(FENCE_OPEN_RE);
    const language = opener?.[1]?.trim() || undefined;
    const bodyStart = opener
      ? fenceStart + opener[0].length
      : fenceStart + 3;

    const fenceEnd = normalized.indexOf('```', bodyStart);
    if (fenceEnd === -1) {
      segments.push({ kind: 'code', text: normalized.slice(bodyStart), language });
      break;
    }

    let codeBody = normalized.slice(bodyStart, fenceEnd);
    if (codeBody.endsWith('\n')) codeBody = codeBody.slice(0, -1);

    segments.push({ kind: 'code', text: codeBody, language });
    i = fenceEnd + 3;
    if (normalized[i] === '\n') i += 1;
  }

  return segments.length ? segments : [{ kind: 'prose', text: normalized }];
}
