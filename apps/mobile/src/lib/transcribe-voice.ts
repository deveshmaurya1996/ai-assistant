import { Platform } from 'react-native';
import { apiClient } from '@/lib/api-client';
import { prepareUploadBlob } from '@/features/upload';
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

  const blob = await prepareUploadBlob({
    uri: audioUri,
    filename: fallbackFilename(type),
    mimeType: type,
  });
  const filename =
    blob instanceof File && blob.name ? blob.name : fallbackFilename(type);
  return apiClient.transcribeVoiceBlob(blob, filename);
}
