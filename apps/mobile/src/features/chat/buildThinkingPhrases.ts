const FUNNY_LINES = [
  'Asking the neurons nicely',
  'Still thinking — coffee went cold',
  'Negotiating with the cloud',
  'One sec, untangling thoughts',
  'Brain cells doing parkour',
  'Loading brilliance… allegedly',
  'This one’s a thinker',
  'Consulting imaginary experts',
  'Patience — almost worth the wait',
  'Teaching electrons to type',
  'Summoning the right words',
  'Plot twist incoming (maybe)',
] as const;

function uniquePush(list: string[], line: string) {
  const t = line.trim();
  if (!t || list.includes(t)) return;
  list.push(t);
}

export function buildThinkingPhrases(userMessage: string): string[] {
  const raw = userMessage.trim();
  const text = raw.toLowerCase();
  const phrases: string[] = [];

  if (!raw) {
    uniquePush(phrases, 'Thinking');
    uniquePush(phrases, 'Working on it');
    return phrases;
  }

  if (/\b(code|debug|fix|error|bug|function|typescript|javascript|python|react|api)\b/.test(text)) {
    uniquePush(phrases, 'Reading your code');
    uniquePush(phrases, 'Tracing the logic');
  } else if (/\b(write|draft|compose|email|letter|essay|paragraph)\b/.test(text)) {
    uniquePush(phrases, 'Drafting a reply');
    uniquePush(phrases, 'Choosing the right words');
  } else if (/\b(search|find|lookup|look up|who is|what is)\b/.test(text)) {
    uniquePush(phrases, 'Searching for details');
    uniquePush(phrases, 'Pulling things together');
  } else if (/\b(remind|schedule|calendar|tomorrow|meeting)\b/.test(text)) {
    uniquePush(phrases, 'Checking timing and context');
    uniquePush(phrases, 'Lining up the details');
  } else if (/\b(explain|why|how|what|when|where)\b/.test(text) || raw.endsWith('?')) {
    uniquePush(phrases, 'Looking into that');
    uniquePush(phrases, 'Connecting the dots');
  } else if (/\b(translate|spanish|french|hindi|language)\b/.test(text)) {
    uniquePush(phrases, 'Working across languages');
  } else if (/\b(image|picture|photo|draw|design)\b/.test(text)) {
    uniquePush(phrases, 'Visualizing your request');
  } else if (text.length > 160) {
    uniquePush(phrases, 'Reading the full message');
    uniquePush(phrases, 'Breaking it into parts');
  } else {
    uniquePush(phrases, 'Thinking about that');
  }

  const snippet = raw.replace(/\s+/g, ' ').slice(0, 36);
  if (snippet.length >= 12) {
    uniquePush(phrases, `On “${snippet}${raw.length > 36 ? '…' : ''}”`);
  }

  uniquePush(phrases, 'Putting the answer together');

  return phrases;
}

export function pickFunnyThinkingLine(recent: Set<string>): string {
  const available = FUNNY_LINES.filter((line) => !recent.has(line));
  const pool = available.length > 0 ? available : [...FUNNY_LINES];
  const line = pool[Math.floor(Math.random() * pool.length)]!;
  recent.add(line);
  if (recent.size > FUNNY_LINES.length - 2) {
    recent.clear();
    recent.add(line);
  }
  return line;
}

export const THINKING_FUNNY_AFTER_MS = 7_000;

export const THINKING_PHRASE_INTERVAL_MS = 2_400;
