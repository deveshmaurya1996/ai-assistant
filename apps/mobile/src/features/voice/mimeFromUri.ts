import { Platform } from 'react-native';

export function mimeFromUri(uri: string): string {
  if (Platform.OS === 'web' && uri.startsWith('blob:')) {
    return 'audio/webm';
  }
  const lower = uri.toLowerCase();
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.caf')) return 'audio/x-caf';
  if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) return 'audio/3gpp';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'audio/m4a';
}
