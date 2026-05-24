const MIME_BY_EXT: Record<string, string> = {
  m4a: 'audio/m4a',
  mp4: 'audio/mp4',
  caf: 'audio/x-caf',
  wav: 'audio/wav',
  webm: 'audio/webm',
  '3gp': 'audio/3gpp',
  mp3: 'audio/mpeg',
};

export function mimeTypeFromUri(uri: string): string {
  const match = uri.match(/\.([a-z0-9]+)(?:\?|$)/i);
  const ext = match?.[1]?.toLowerCase() ?? 'm4a';
  return MIME_BY_EXT[ext] ?? 'audio/m4a';
}
