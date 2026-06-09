import { Platform } from 'react-native';
import {
  cacheDirectory,
  downloadAsync,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';
import { apiClient } from '@/lib/api-client';
import { getAuthCookie, getAuthSessionToken } from '@/lib/auth-cookies';

const CACHE_DIR = `${cacheDirectory ?? ''}chat-files/`;
const EXPORT_DIR = `${cacheDirectory ?? ''}chat-files-export/`;

function exportExtension(filename?: string, mimeType?: string): string {
  if (filename) {
    const match = filename.match(/\.([a-zA-Z0-9]+)$/);
    if (match) return match[1].toLowerCase();
  }
  const mime = mimeType?.toLowerCase() ?? '';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('heic') || mime.includes('heif')) return 'heic';
  return 'jpg';
}

export function authenticatedFileUrl(fileId: string): string {
  const token = getAuthSessionToken();
  return apiClient.fileContentUrl(fileId, token);
}

export function authenticatedFileHeaders(): Record<string, string> | undefined {
  const cookie = getAuthCookie();
  if (!cookie) return undefined;
  return { Cookie: cookie };
}

async function cacheAuthenticatedFileWeb(fileId: string): Promise<string> {
  const url = authenticatedFileUrl(fileId);
  const headers = authenticatedFileHeaders();
  const res = await fetch(url, {
    credentials: 'include',
    headers: headers ?? {},
  });
  if (!res.ok) {
    throw new Error(`Failed to load file (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function cacheAuthenticatedFile(fileId: string): Promise<string> {
  if (Platform.OS === 'web') {
    return cacheAuthenticatedFileWeb(fileId);
  }

  const dir = CACHE_DIR;
  if (dir) {
    await makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  }
  const dest = `${dir}${fileId}`;
  const info = await getInfoAsync(dest);
  if (info.exists) {
    return dest;
  }

  const url = authenticatedFileUrl(fileId);
  const headers = authenticatedFileHeaders();
  const result = await downloadAsync(url, dest, headers ? { headers } : undefined);
  return result.uri;
}

export async function resolveExportImageUri(
  fileId: string,
  filename?: string,
  mimeType?: string
): Promise<string> {
  if (Platform.OS === 'web') {
    return cacheAuthenticatedFileWeb(fileId);
  }

  const ext = exportExtension(filename, mimeType);
  if (EXPORT_DIR) {
    await makeDirectoryAsync(EXPORT_DIR, { intermediates: true }).catch(() => undefined);
  }
  const dest = `${EXPORT_DIR}${fileId}.${ext}`;
  const info = await getInfoAsync(dest);
  if (info.exists) {
    return dest;
  }

  const url = authenticatedFileUrl(fileId);
  const headers = authenticatedFileHeaders();
  const result = await downloadAsync(url, dest, headers ? { headers } : undefined);
  return result.uri;
}
