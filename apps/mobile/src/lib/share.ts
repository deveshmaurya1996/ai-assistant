import { Alert, Platform, Share } from 'react-native';
import {
  Asset,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy';
import type { ChatAttachmentRef, ChatMessage } from '@ai-assistant/sdk';
import { resolveExportImageUri } from '@/lib/authenticated-file';

export function formatChatMessagesForShare(
  messages: ChatMessage[],
  title?: string
): string {
  const lines: string[] = [];
  if (title?.trim()) {
    lines.push(title.trim(), '');
  }
  for (const message of messages) {
    const role = message.role === 'USER' ? 'You' : 'Assistant';
    const text = message.content?.trim();
    if (text) {
      lines.push(`${role}:`, text, '');
    }
    if (message.attachments?.length) {
      const names = message.attachments
        .map((a) => a.filename || a.kind)
        .filter(Boolean)
        .join(', ');
      if (names) {
        lines.push(`${role} [attachment]: ${names}`, '');
      }
    }
  }
  return lines.join('\n').trim();
}

export async function shareText(message: string, dialogTitle?: string): Promise<void> {
  if (!message.trim()) {
    Alert.alert('Nothing to share', 'There is no content to share yet.');
    return;
  }
  await Share.share(
    Platform.OS === 'ios' ? { message } : { message, title: dialogTitle }
  );
}

function imageExtension(filename?: string, mimeType?: string): string {
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

function mimeTypeForExtension(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

function hasImageExtension(uri: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(uri.split('?')[0] ?? uri);
}

async function ensureImageFileExtension(
  uri: string,
  filename?: string,
  mimeType?: string
): Promise<string> {
  if (hasImageExtension(uri)) {
    return uri;
  }
  const ext = imageExtension(filename, mimeType);
  const dir = cacheDirectory ?? '';
  const dest = `${dir}export-${Date.now()}.${ext}`;
  await copyAsync({ from: uri, to: dest });
  return dest;
}

async function ensureMediaLibraryWritePermission(): Promise<boolean> {
  const current = await getPermissionsAsync(true);
  if (current.granted) return true;
  const requested = await requestPermissionsAsync(true);
  return requested.granted;
}

async function resolveShareableImageUri(
  fileIdOrUri: string,
  filename?: string,
  mimeType?: string
): Promise<string> {
  const isLocalUri =
    fileIdOrUri.startsWith('file:') ||
    fileIdOrUri.startsWith('content:') ||
    fileIdOrUri.startsWith('blob:') ||
    fileIdOrUri.startsWith('data:') ||
    fileIdOrUri.startsWith('http');

  if (isLocalUri) {
    return ensureImageFileExtension(fileIdOrUri, filename, mimeType);
  }

  return resolveExportImageUri(fileIdOrUri, filename, mimeType);
}

export async function shareImageFromFileId(
  fileId: string,
  filename?: string,
  mimeType?: string
): Promise<void> {
  const uri = await resolveShareableImageUri(fileId, filename, mimeType);
  await shareImageFromUri(uri, filename, mimeType);
}

export async function shareImageFromUri(
  uri: string,
  filename?: string,
  mimeType?: string
): Promise<void> {
  const localUri = await resolveShareableImageUri(uri, filename, mimeType);
  if (Platform.OS === 'web') {
    await shareText(localUri, filename ?? 'Image');
    return;
  }
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
    return;
  }
  const ext = imageExtension(filename, mimeType);
  await Sharing.shareAsync(localUri, {
    mimeType: mimeTypeForExtension(ext),
    dialogTitle: filename ?? 'Share image',
    UTI: ext === 'png' ? 'public.png' : 'public.jpeg',
  });
}

export async function downloadImageToDevice(
  fileIdOrUri: string,
  filename?: string,
  mimeType?: string
): Promise<void> {
  const uri = await resolveShareableImageUri(fileIdOrUri, filename, mimeType);
  const ext = imageExtension(filename, mimeType);
  const downloadName = filename?.includes('.') ? filename : `image.${ext}`;

  if (Platform.OS === 'web') {
    if (uri.startsWith('blob:') || uri.startsWith('data:')) {
      const anchor = document.createElement('a');
      anchor.href = uri;
      anchor.download = downloadName;
      anchor.click();
      return;
    }
    const res = await fetch(uri);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = downloadName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    return;
  }

  const allowed = await ensureMediaLibraryWritePermission();
  if (!allowed) {
    Alert.alert(
      'Permission required',
      'Allow photo library access to save images.'
    );
    return;
  }

  await Asset.create(uri);
  Alert.alert('Saved', 'Image saved to your gallery.');
}

export async function shareAssistantMessage(message: ChatMessage): Promise<void> {
  const text = message.content?.trim() ?? '';
  const image = message.attachments?.find((a) => a.kind === 'image');

  if (image && !text) {
    await shareImageFromFileId(image.id, image.filename, image.mimeType);
    return;
  }

  if (text) {
    await shareText(text);
    return;
  }

  if (image) {
    await shareImageFromFileId(image.id, image.filename, image.mimeType);
    return;
  }

  Alert.alert('Nothing to share', 'This message has no content to share.');
}

export async function shareChatSession(
  sessionId: string,
  title?: string,
  fetchMessages: (id: string) => Promise<ChatMessage[]> = async () => []
): Promise<void> {
  const messages = await fetchMessages(sessionId);
  const text = formatChatMessagesForShare(messages, title);
  await shareText(text, title ?? 'Chat');
}

export function firstImageAttachment(
  message: ChatMessage
): ChatAttachmentRef | undefined {
  return message.attachments?.find((a) => a.kind === 'image');
}
