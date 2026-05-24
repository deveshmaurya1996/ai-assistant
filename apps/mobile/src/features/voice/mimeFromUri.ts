export function mimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.caf')) return 'audio/x-caf';
  if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) return 'audio/3gpp';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'audio/m4a';
}
