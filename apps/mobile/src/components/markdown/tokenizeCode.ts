import type { CodeTokenKind } from './codeTheme';
import { resolveLanguageFamily, type LanguageFamily } from './codeLanguage';

export type CodeToken = { kind: CodeTokenKind; text: string };

type LangProfile = {
  family: LanguageFamily;
  keywords: Set<string>;
  builtins?: Set<string>;
  lineComments: string[];
  blockComments: Array<{ open: string; close: string }>;
  markupTags?: boolean;
};

const C_LIKE_KEYWORDS = new Set([
  'if', 'else', 'elif', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'class', 'struct', 'enum', 'interface', 'type', 'fn', 'func', 'function',
  'const', 'let', 'var', 'mut', 'pub', 'private', 'public', 'protected', 'static',
  'async', 'await', 'try', 'catch', 'throw', 'new', 'delete', 'import', 'export',
  'from', 'package', 'namespace', 'using', 'include', 'define', 'typedef', 'impl',
  'trait', 'match', 'loop', 'in', 'of', 'true', 'false', 'null', 'nil', 'void',
  'int', 'float', 'bool', 'char', 'string', 'auto', 'self', 'Self', 'this', 'super',
]);

const PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import',
  'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'True', 'try', 'while', 'with', 'yield',
]);

const JS_KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for',
  'from', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null', 'of',
  'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'undefined', 'var', 'void', 'while', 'with', 'yield',
]);

const FAMILY_PROFILES: Record<LanguageFamily, LangProfile> = {
  python: {
    family: 'python',
    keywords: PYTHON_KEYWORDS,
    lineComments: ['#'],
    blockComments: [],
  },
  javascript: {
    family: 'javascript',
    keywords: JS_KEYWORDS,
    lineComments: ['//'],
    blockComments: [{ open: '/*', close: '*/' }],
  },
  typescript: {
    family: 'typescript',
    keywords: new Set([...JS_KEYWORDS, 'interface', 'type', 'enum', 'implements', 'readonly']),
    lineComments: ['//'],
    blockComments: [{ open: '/*', close: '*/' }],
  },
  'c-like': {
    family: 'c-like',
    keywords: C_LIKE_KEYWORDS,
    lineComments: ['//'],
    blockComments: [{ open: '/*', close: '*/' }],
  },
  shell: {
    family: 'shell',
    keywords: new Set(['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'echo', 'export']),
    lineComments: ['#'],
    blockComments: [],
  },
  markup: {
    family: 'markup',
    keywords: new Set(),
    lineComments: [],
    blockComments: [{ open: '<!--', close: '-->' }],
    markupTags: true,
  },
  json: {
    family: 'json',
    keywords: new Set(['true', 'false', 'null']),
    lineComments: [],
    blockComments: [],
  },
  generic: {
    family: 'generic',
    keywords: new Set(),
    lineComments: ['#', '//', '--', ';'],
    blockComments: [
      { open: '/*', close: '*/' },
      { open: '<!--', close: '-->' },
    ],
    markupTags: true,
  },
};

function tokenizeJson(source: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const push = (kind: CodeTokenKind, text: string) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last?.kind === kind) {
      last.text += text;
      return;
    }
    tokens.push({ kind, text });
  };
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === ch) {
          j += 1;
          break;
        }
        j += 1;
      }
      push('string', source.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9.eE+-]/.test(source[j] ?? '')) j += 1;
      push('number', source.slice(i, j));
      i = j;
      continue;
    }
    const word = source.slice(i).match(/^(true|false|null)\b/);
    if (word) {
      push('keyword', word[1]);
      i += word[1].length;
      continue;
    }
    push('plain', ch);
    i += 1;
  }
  return tokens;
}

function classifyWord(word: string, profile: LangProfile): CodeTokenKind {
  if (profile.keywords.has(word) || profile.keywords.has(word.toLowerCase())) return 'keyword';
  if (profile.builtins?.has(word)) return 'builtin';
  return 'plain';
}

function tryMarkupTag(source: string, i: number, push: (kind: CodeTokenKind, text: string) => void): number | null {
  if (source[i] !== '<' || !/[a-zA-Z!?]/.test(source[i + 1] ?? '')) return null;
  push('operator', '<');
  let j = i + 1;
  if (source[j] === '/') j += 1;
  const nameStart = j;
  while (j < source.length && /[a-zA-Z0-9:-]/.test(source[j] ?? '')) j += 1;
  if (j > nameStart) push('keyword', source.slice(nameStart, j));
  return j;
}

function tokenizeWithProfile(source: string, profile: LangProfile): CodeToken[] {
  const tokens: CodeToken[] = [];
  const push = (kind: CodeTokenKind, text: string) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last?.kind === kind) {
      last.text += text;
      return;
    }
    tokens.push({ kind, text });
  };

  let i = 0;
  while (i < source.length) {
    let blockHit = false;
    for (const block of profile.blockComments) {
      if (source.startsWith(block.open, i)) {
        const end = source.indexOf(block.close, i + block.open.length);
        push('comment', end === -1 ? source.slice(i) : source.slice(i, end + block.close.length));
        i = end === -1 ? source.length : end + block.close.length;
        blockHit = true;
        break;
      }
    }
    if (blockHit) continue;

    let lineHit = false;
    for (const marker of profile.lineComments) {
      if (source.startsWith(marker, i)) {
        const end = source.indexOf('\n', i);
        push('comment', end === -1 ? source.slice(i) : source.slice(i, end));
        i = end === -1 ? source.length : end;
        lineHit = true;
        break;
      }
    }
    if (lineHit) continue;

    if (profile.markupTags) {
      const tagEnd = tryMarkupTag(source, i, push);
      if (tagEnd !== null) {
        i = tagEnd;
        continue;
      }
    }

    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const triple = source.slice(i, i + 3);
      const quote = triple === '"""' || triple === "'''" ? triple : ch;
      let j = i + quote.length;
      while (j < source.length) {
        if (source[j] === '\\' && quote.length === 1) {
          j += 2;
          continue;
        }
        if (source.startsWith(quote, j)) {
          j += quote.length;
          break;
        }
        j += 1;
      }
      push('string', source.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== '`') j += 1;
      if (j < source.length) j += 1;
      push('string', source.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      let j = i;
      while (j < source.length && /[0-9._xXa-fA-F]/.test(source[j] ?? '')) j += 1;
      if (j > i) {
        push('number', source.slice(i, j));
        i = j;
        continue;
      }
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < source.length && /[a-zA-Z0-9_]/.test(source[j] ?? '')) j += 1;
      push(classifyWord(source.slice(i, j), profile), source.slice(i, j));
      i = j;
      continue;
    }
    if (/[=<>!+\-*/%&|^~?:]/.test(ch)) {
      push('operator', ch);
      i += 1;
      continue;
    }
    push('plain', ch);
    i += 1;
  }
  return tokens;
}

export function tokenizeCode(source: string, language?: string): CodeToken[] {
  if (!source) return [];
  const family = resolveLanguageFamily(language);
  if (family === 'json') return tokenizeJson(source);
  return tokenizeWithProfile(source, FAMILY_PROFILES[family]);
}

/** @deprecated Use formatCodeLanguageLabel for UI; resolveLanguageFamily for tokenizing. */
export function normalizeCodeLanguage(language?: string): string {
  return resolveLanguageFamily(language);
}
