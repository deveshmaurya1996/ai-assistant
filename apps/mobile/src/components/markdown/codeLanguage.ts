
export function formatCodeLanguageLabel(language?: string): string | null {
  const raw = (language ?? '').trim();
  if (!raw) return null;
  const tag = raw.split(/\s+/)[0] ?? '';
  const cleaned = tag.replace(/[^a-zA-Z0-9+#.-]/g, '');
  return cleaned ? cleaned.toLowerCase() : null;
}

export type LanguageFamily =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'c-like'
  | 'shell'
  | 'markup'
  | 'json'
  | 'generic';

export function resolveLanguageFamily(language?: string): LanguageFamily {
  const raw = formatCodeLanguageLabel(language);
  if (!raw) return 'generic';
  if (raw in FAMILY_ALIASES) return FAMILY_ALIASES[raw];
  if (raw.startsWith('python')) return 'python';
  if (raw === 'js' || raw.endsWith('script') || raw === 'jsx') return 'javascript';
  if (raw === 'ts' || raw.endsWith('typescript') || raw === 'tsx') return 'typescript';
  if (raw === 'json' || raw === 'jsonc' || raw === 'json5') return 'json';
  if (raw === 'html' || raw === 'htm' || raw === 'xml' || raw === 'svg' || raw === 'xhtml') {
    return 'markup';
  }
  if (raw === 'sh' || raw === 'bash' || raw === 'zsh' || raw === 'fish' || raw.endsWith('sh')) {
    return 'shell';
  }
  return 'generic';
}

const FAMILY_ALIASES: Record<string, LanguageFamily> = {
  py: 'python',
  python2: 'python',
  python3: 'python',
  javascript: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
  typescript: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  xhtml: 'markup',
  markdown: 'markup',
  md: 'markup',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  shell: 'shell',
  powershell: 'shell',
  ps1: 'shell',
  // C-family and systems langs share comment/string rules
  c: 'c-like',
  h: 'c-like',
  cpp: 'c-like',
  'c++': 'c-like',
  cxx: 'c-like',
  cc: 'c-like',
  hpp: 'c-like',
  cs: 'c-like',
  csharp: 'c-like',
  'c#': 'c-like',
  java: 'c-like',
  kotlin: 'c-like',
  kt: 'c-like',
  kts: 'c-like',
  swift: 'c-like',
  go: 'c-like',
  golang: 'c-like',
  rust: 'c-like',
  rs: 'c-like',
  dart: 'c-like',
  scala: 'c-like',
  groovy: 'c-like',
  objectivec: 'c-like',
  objc: 'c-like',
  php: 'c-like',
  ruby: 'c-like',
  rb: 'c-like',
  perl: 'c-like',
  pl: 'c-like',
  lua: 'c-like',
  r: 'c-like',
  sql: 'c-like',
  mysql: 'c-like',
  postgres: 'c-like',
  postgresql: 'c-like',
  pgsql: 'c-like',
  tsql: 'c-like',
  verilog: 'c-like',
  vhdl: 'c-like',
  zig: 'c-like',
  nim: 'c-like',
  crystal: 'c-like',
  elixir: 'c-like',
  ex: 'c-like',
  erlang: 'c-like',
  erl: 'c-like',
  haskell: 'c-like',
  hs: 'c-like',
  ocaml: 'c-like',
  ml: 'c-like',
  fsharp: 'c-like',
  fs: 'c-like',
  vb: 'c-like',
  vba: 'c-like',
  matlab: 'c-like',
  octave: 'c-like',
  julia: 'c-like',
  jl: 'c-like',
  cmake: 'c-like',
  dockerfile: 'c-like',
  docker: 'c-like',
  graphql: 'c-like',
  gql: 'c-like',
  solidity: 'c-like',
  sol: 'c-like',
  wasm: 'c-like',
  wat: 'c-like',
  toml: 'c-like',
  yaml: 'c-like',
  yml: 'c-like',
  ini: 'c-like',
  proto: 'c-like',
  protobuf: 'c-like',
  terraform: 'c-like',
  tf: 'c-like',
  hcl: 'c-like',
  latex: 'c-like',
  tex: 'c-like',
  css: 'c-like',
  scss: 'c-like',
  sass: 'c-like',
  less: 'c-like',
  stylus: 'c-like',
  vue: 'javascript',
  svelte: 'javascript',
};
