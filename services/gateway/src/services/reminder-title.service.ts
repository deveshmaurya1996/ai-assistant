const PREFIX_PATTERNS = [
  /^hey\s+(?:can\s+you\s+|could\s+you\s+)?/i,
  /^i\s+need\s+you\s+to\s+set\s+(?:a\s+)?reminder\s+(?:for\s+me\s+)?(?:to\s+)?/i,
  /^i\s+need\s+you\s+to\s+/i,
  /^please\s+/i,
  /^can\s+you\s+set\s+(?:a\s+)?reminder\s+(?:for\s+me\s+)?(?:to\s+)?/i,
  /^could\s+you\s+set\s+(?:a\s+)?reminder\s+(?:for\s+me\s+)?(?:to\s+)?/i,
  /^can\s+you\s+/i,
  /^could\s+you\s+/i,
  /^set\s+a\s+reminder\s+(?:for\s+me\s+)?(?:to\s+)?/i,
  /^set\s+reminder\s+(?:for\s+me\s+)?(?:to\s+)?/i,
  /^schedule\s+(?:a\s+)?reminder\s+(?:for\s+me\s+)?(?:to\s+)?/i,
  /^add\s+(?:a\s+)?reminder\s+(?:for\s+me\s+)?(?:to\s+)?/i,
  /^create\s+(?:a\s+)?reminder\s+(?:for\s+me\s+)?(?:to\s+)?/i,
  /^remind\s+me\s+(?:to\s+)?/i,
];

const SCHEDULE_SUFFIX =
  /\s+(?:every\s+(?:\d+\s*)?(?:min(?:ute)?s?|hours?|hour|days?|day|morning|evening|night|week|weekdays?)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|tomorrow(?:\s+morning)?|in\s+\d+\s+hours?)\s*\.?$/i;

export function deriveReminderDisplayTitle(
  userPrompt: string,
  fallbackTitle = 'Reminder'
): string {
  let text = userPrompt.trim();
  if (!text) {
    return fallbackTitle.trim() || 'Reminder';
  }

  for (const pattern of PREFIX_PATTERNS) {
    text = text.replace(pattern, '');
  }
  text = text.replace(/^to\s+/i, '').trim();

  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(SCHEDULE_SUFFIX, '').trim();
  }

  if (!text) {
    const fb = fallbackTitle.trim();
    return fb && fb.toLowerCase() !== 'reminder' ? fb : 'Reminder';
  }

  if (/^not\s+/i.test(text)) {
    text = `don't ${text.slice(4)}`;
  }
  text = text.replace(/\bmy\b/gi, 'your').trim();

  return text.charAt(0).toUpperCase() + text.slice(1);
}
