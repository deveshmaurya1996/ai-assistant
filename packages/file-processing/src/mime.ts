const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};

function mimeFromZipContainer(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return null;
}

export function normalizeMimeType(mimeType: string, filename: string): string {
  const lower = filename.toLowerCase();

  if (mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed') {
    const fromName = mimeFromZipContainer(filename);
    if (fromName) return fromName;
  }

  if (mimeType && mimeType !== 'application/octet-stream') {
    return mimeType;
  }

  for (const [ext, mime] of Object.entries(EXT_MIME)) {
    if (lower.endsWith(ext)) return mime;
  }
  return mimeType || 'application/octet-stream';
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function isTextLike(mimeType: string, filename: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  const lower = filename.toLowerCase();
  return /\.(md|markdown|json|csv|txt|log|xml|yaml|yml|ts|tsx|js|jsx|py)$/.test(
    lower
  );
}

export function isDocx(mimeType: string, filename: string): boolean {
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return true;
  }
  return filename.toLowerCase().endsWith('.docx');
}

export function isLegacyDoc(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.doc') && !lower.endsWith('.docx');
}

export function isSpreadsheet(mimeType: string, filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    mimeType.includes('spreadsheet') ||
    mimeType === 'application/vnd.ms-excel' ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls')
  );
}

export function isPptx(mimeType: string, filename: string): boolean {
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return true;
  }
  return filename.toLowerCase().endsWith('.pptx');
}

export function sniffMimeFromBytes(bytes: Buffer): string | null {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === '%PDF') {
    return 'application/pdf';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF87a') {
    return 'image/gif';
  }
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF89a') {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return 'application/zip';
  }
  return null;
}
