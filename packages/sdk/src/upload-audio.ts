import type { UploadFilePayload } from '@ai-assistant/types';

function recordingFilename(mimeType: string): string {
  if (mimeType.includes('webm')) return 'recording.webm';
  if (mimeType.includes('wav')) return 'recording.wav';
  if (mimeType.includes('3gpp')) return 'recording.3gp';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'recording.mp3';
  return 'recording.m4a';
}

function isRemoteOrBlobUri(uri: string): boolean {
  return (
    uri.startsWith('blob:') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  );
}

export async function buildAudioUploadPart(
  audioUri: string,
  mimeType = 'audio/m4a'
): Promise<Blob | UploadFilePayload> {
  if (isRemoteOrBlobUri(audioUri)) {
    const res = await fetch(audioUri);
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

  return {
    uri: audioUri,
    name: recordingFilename(mimeType),
    type: mimeType,
  };
}
