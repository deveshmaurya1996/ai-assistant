import type { UploadFilePayload } from '@ai-assistant/types';

export function isReactNative(): boolean {
  return (
    typeof navigator !== 'undefined' && navigator.product === 'ReactNative'
  );
}

export function isUploadFilePayload(
  file: Blob | File | UploadFilePayload
): file is UploadFilePayload {
  return (
    typeof file === 'object' &&
    file !== null &&
    !(file instanceof Blob) &&
    'uri' in file &&
    typeof (file as UploadFilePayload).uri === 'string'
  );
}

export function normalizeNativeFileUri(uri: string): string {
  if (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://')
  ) {
    return uri;
  }
  return `file://${uri}`;
}

export function toNativeUploadPayload(
  uri: string,
  name: string,
  type: string
): UploadFilePayload {
  return {
    uri: normalizeNativeFileUri(uri),
    name,
    type: type || 'application/octet-stream',
  };
}
