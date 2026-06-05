const TOOL_ID_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/i;

const TOOL_QUERY_LABELS: Record<string, string> = {
  'email.list_unread': 'Check Gmail for important unread emails',
  'messaging.list_unread': 'Check WhatsApp for important unread messages',
  'whatsapp.list_unread': 'Check WhatsApp for important unread messages',
};

const DEFAULT_AUTOMATION_QUERY =
  'Check Gmail and WhatsApp for important unread items. ' +
  'Summarize only urgent or actionable messages. ' +
  'If nothing needs attention, say so briefly.';

function looksLikeToolId(text: string): boolean {
  return TOOL_ID_RE.test(text.trim());
}

export function humanizeAutomationQuery(query: string, userPrompt = ''): string {
  const q = query.trim();
  if (!q || !looksLikeToolId(q)) {
    return q || userPrompt.trim() || DEFAULT_AUTOMATION_QUERY;
  }
  if (TOOL_QUERY_LABELS[q]) {
    return TOOL_QUERY_LABELS[q];
  }
  const up = userPrompt.trim();
  if (up && !looksLikeToolId(up)) {
    return up;
  }
  return DEFAULT_AUTOMATION_QUERY;
}
