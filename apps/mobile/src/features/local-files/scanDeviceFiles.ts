import * as DocumentPicker from 'expo-document-picker';
import {
  AssetField,
  MediaType,
  Query,
  requestPermissionsAsync,
} from 'expo-media-library';
import type { DeviceFilesSource } from '@ai-assistant/types';
import type { LocalFileCandidate } from './types';

const PHOTO_PAGE_SIZE = 100;
const DOC_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.',
  'text/',
];

function isDocumentMime(mime?: string): boolean {
  if (!mime) return true;
  return DOC_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

async function assetToCandidate(
  asset: Awaited<ReturnType<Query['exe']>>[number]
): Promise<LocalFileCandidate | null> {
  const [filename, uri, modificationTime] = await Promise.all([
    asset.getFilename(),
    asset.getUri(),
    asset.getModificationTime(),
  ]);

  return {
    devicePath: `media:${asset.id}`,
    filename: filename || `photo-${asset.id}.jpg`,
    uri,
    mimeType: 'image/jpeg',
    sizeBytes: undefined,
    modifiedAt: modificationTime ? new Date(modificationTime).toISOString() : undefined,
    source: 'photos',
  };
}

export async function pickDeviceDocuments(): Promise<LocalFileCandidate[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return [];

  return result.assets.map((asset) => ({
    devicePath: `doc:${asset.uri}`,
    filename: asset.name ?? 'document',
    uri: asset.uri,
    mimeType: asset.mimeType ?? undefined,
    sizeBytes: asset.size ?? undefined,
    modifiedAt: asset.lastModified ? new Date(asset.lastModified).toISOString() : undefined,
    source: 'documents' as DeviceFilesSource,
  }));
}

export async function scanDevicePhotos(options?: {
  since?: string;
  onProgress?: (scanned: number) => void;
}): Promise<LocalFileCandidate[]> {
  const permission = await requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to sync images from your phone.');
  }

  const sinceMs = options?.since ? new Date(options.since).getTime() : null;
  const results: LocalFileCandidate[] = [];
  let offset = 0;

  while (true) {
    const page = await new Query()
      .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
      .orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false })
      .limit(PHOTO_PAGE_SIZE)
      .offset(offset)
      .exe();

    if (page.length === 0) break;

    let reachedOlder = false;
    for (const asset of page) {
      const modificationTime = await asset.getModificationTime();
      if (sinceMs && modificationTime != null && modificationTime <= sinceMs) {
        reachedOlder = true;
        break;
      }

      const candidate = await assetToCandidate(asset);
      if (candidate) results.push(candidate);
    }

    options?.onProgress?.(results.length);

    if (reachedOlder || page.length < PHOTO_PAGE_SIZE) break;
    offset += page.length;
  }

  return results;
}

export async function scanPhotoLibrary(): Promise<LocalFileCandidate[]> {
  return scanDevicePhotos();
}

export async function collectDeviceFiles(
  enabledSources: DeviceFilesSource[],
  options?: {
    since?: string;
    onProgress?: (message: string) => void;
    onScanCount?: (count: number) => void;
  }
): Promise<LocalFileCandidate[]> {
  const out: LocalFileCandidate[] = [];

  if (enabledSources.includes('photos')) {
    options?.onProgress?.('Scanning photo library…');
    const photos = await scanDevicePhotos({
      since: options?.since,
      onProgress: options?.onScanCount,
    });
    out.push(...photos);
  }

  if (enabledSources.includes('documents')) {
    options?.onProgress?.('Pick documents to add from your phone…');
    const docs = await pickDeviceDocuments();
    out.push(...docs.filter((d) => isDocumentMime(d.mimeType)));
  }

  return out;
}
