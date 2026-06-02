import { Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';
import type { FileAssetResponse } from '@ai-assistant/types';
import { apiClient } from '@/lib/api-client';
import { resolveUploadMimeType } from './mime';
import type { LocalFileSource } from './types';

export async function prepareUploadBlob(source: LocalFileSource): Promise<Blob | File> {
  if (source.webFile) {
    return source.webFile;
  }
  if (Platform.OS === 'web') {
    const res = await fetch(source.uri);
    if (!res.ok) {
      throw new Error(`Failed to read file (${res.status})`);
    }
    const blob = await res.blob();
    const mime = resolveUploadMimeType(source.filename, source.mimeType);
    if (typeof globalThis.File !== 'undefined') {
      return new globalThis.File([blob], source.filename, { type: mime });
    }
    return blob.type ? blob : new Blob([blob], { type: mime });
  }
  return new ExpoFile(source.uri);
}

export async function uploadLocalFile(
  source: LocalFileSource
): Promise<FileAssetResponse> {
  const filename = source.filename;
  const mimeType = resolveUploadMimeType(filename, source.mimeType);

  if (source.webFile) {
    return apiClient.uploadFilePart(source.webFile, filename);
  }

  if (Platform.OS === 'web') {
    return apiClient.uploadFile(source.uri, filename, mimeType);
  }

  const blob = await prepareUploadBlob(source);
  const name =
    'name' in blob && typeof blob.name === 'string' && blob.name
      ? blob.name
      : filename;
  return apiClient.uploadFilePart(blob, name);
}
