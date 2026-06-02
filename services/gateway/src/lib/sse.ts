export type SseEvent = {
  event: string;
  data: string;
};

export function parseSseBuffer(buffer: string): {
  events: SseEvent[];
  rest: string;
} {
  const events: SseEvent[] = [];
  let rest = buffer;

  while (true) {
    const match = rest.match(/\r?\n\r?\n/);
    if (!match || match.index === undefined) break;

    const block = rest.slice(0, match.index);
    rest = rest.slice(match.index + match[0].length);
    if (!block.trim()) continue;

    let event = 'message';
    const dataLines: string[] = [];

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^\s/, ''));
      }
    }

    if (dataLines.length > 0) {
      events.push({ event, data: dataLines.join('\n') });
    }
  }

  return { events, rest };
}

export type ChatTokenPayload = { content: string };
export type ChatDonePayload = { model?: string };
export type ChatErrorPayload = { message: string };
