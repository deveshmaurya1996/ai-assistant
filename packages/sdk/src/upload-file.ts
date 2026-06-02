import type { UploadFilePayload } from '@ai-assistant/types';
import {
  isReactNative,
  toNativeUploadPayload,
} from './upload-env';

function shouldMaterializeFromUri(uri: string): boolean {
  return (
    uri.startsWith('blob:') ||
    uri.startsWith('data:') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  );
}

async function uriToBlob(uri: string, name: string, type: string): Promise<Blob | File> {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(`Failed to read file (${res.status})`);
  }
  const blob = await res.blob();
  const mime = blob.type || type || 'application/octet-stream';

  if (typeof File !== 'undefined') {
    return new File([blob], name, { type: mime });
  }
  return blob.type ? blob : new Blob([blob], { type: mime });
}

export async function buildFileUploadPart(
  uri: string,
  name: string,
  type: string
): Promise<Blob | File | UploadFilePayload> {
  if (isReactNative()) {
    return toNativeUploadPayload(uri, name, type);
  }

  if (shouldMaterializeFromUri(uri)) {
    return uriToBlob(uri, name, type);
  }

  try {
    return await uriToBlob(uri, name, type);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Could not read file for upload: ${detail}`);
  }
}
