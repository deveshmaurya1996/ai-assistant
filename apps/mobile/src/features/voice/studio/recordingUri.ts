import type { AudioRecording } from '@siteed/audio-studio';

export function recordingFileUri(result: AudioRecording): string {
  return result.compression?.compressedFileUri ?? result.fileUri;
}

export function recordingMimeType(result: AudioRecording): string {
  return result.compression?.mimeType ?? result.mimeType;
}
