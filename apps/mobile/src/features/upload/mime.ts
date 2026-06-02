const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

function mimeFromZipContainer(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return null;
}

export function resolveUploadMimeType(
  filename: string,
  mimeType?: string
): string {
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed'
  ) {
    const fromName = mimeFromZipContainer(filename);
    if (fromName) return fromName;
  }

  if (mimeType && mimeType !== 'application/octet-stream') {
    return mimeType;
  }
  const lower = filename.toLowerCase();
  for (const [ext, mime] of Object.entries(EXT_MIME)) {
    if (lower.endsWith(ext)) return mime;
  }
  return mimeType || 'application/octet-stream';
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
