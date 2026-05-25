import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { apiClient } from '@/lib/api-client';
import { mimeFromUri } from '@/features/voice/mimeFromUri';

function fallbackFilename(mimeType: string): string {
  if (mimeType.includes('webm')) return 'recording.webm';
  if (mimeType.includes('3gpp')) return 'recording.3gp';
  if (mimeType.includes('wav')) return 'recording.wav';
  return 'recording.m4a';
}

export async function transcribeVoice(
  audioUri: string,
  mimeType?: string
): Promise<{ text: string }> {
  const type = mimeType ?? mimeFromUri(audioUri);

  if (Platform.OS === 'web') {
    return apiClient.transcribeVoice(audioUri, type);
  }

  const recording = new File(audioUri);
  const filename = recording.name || fallbackFilename(type);
  return apiClient.transcribeVoiceBlob(recording, filename);
}
