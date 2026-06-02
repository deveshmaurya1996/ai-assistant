import type { ParsedCliCommand } from './types';

/**
 * Parse internal CLI-style commands:
 *   assistant exec communication.message.send --provider=whatsapp --to=john --message=hi
 */
export function parseAssistantCliCommand(input: string): ParsedCliCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('assistant ')) return null;

  const tokens = tokenize(trimmed);
  if (tokens.length < 3 || tokens[0] !== 'assistant' || tokens[1] !== 'exec') return null;

  const capabilityId = tokens[2];
  const args: Record<string, string> = {};
  let providerId: string | undefined;

  for (let i = 3; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.startsWith('--provider=')) {
      providerId = t.slice('--provider='.length);
      continue;
    }
    if (t.startsWith('--') && t.includes('=')) {
      const eq = t.indexOf('=');
      const key = t.slice(2, eq);
      const val = t.slice(eq + 1);
      args[key] = val;
    }
  }

  return { capabilityId, providerId, args };
}

function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote: '"' | "'" | null = null;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === ' ') {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
