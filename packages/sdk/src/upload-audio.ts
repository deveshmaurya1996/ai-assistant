import type { UploadFilePayload } from '@ai-assistant/types';
import {
  isReactNative,
  toNativeUploadPayload,
} from './upload-env';

function recordingFilename(mimeType: string): string {
  if (mimeType.includes('webm')) return 'recording.webm';
  if (mimeType.includes('wav')) return 'recording.wav';
  if (mimeType.includes('3gpp')) return 'recording.3gp';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'recording.mp3';
  return 'recording.m4a';
}

function shouldMaterializeFromUri(uri: string): boolean {
  return (
    uri.startsWith('blob:') ||
    uri.startsWith('data:') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  );
}

async function uriToBlob(uri: string, mimeType: string): Promise<Blob | File> {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(`Failed to read recording (${res.status})`);
  }
  const blob = await res.blob();
  const type = blob.type || mimeType || 'application/octet-stream';
  const filename = recordingFilename(type);

  if (typeof File !== 'undefined') {
    return new File([blob], filename, { type });
  }
  return blob.type ? blob : new Blob([blob], { type });
}

export async function buildAudioUploadPart(
  audioUri: string,
  mimeType = 'audio/m4a'
): Promise<Blob | File | UploadFilePayload> {
  if (isReactNative()) {
    return toNativeUploadPayload(
      audioUri,
      recordingFilename(mimeType),
      mimeType
    );
  }

  if (shouldMaterializeFromUri(audioUri)) {
    return uriToBlob(audioUri, mimeType);
  }

  try {
    return await uriToBlob(audioUri, mimeType);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Could not read recording for upload: ${detail}`);
  }
}
