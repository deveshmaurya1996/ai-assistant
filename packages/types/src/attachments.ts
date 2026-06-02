export type ChatAttachmentKind = 'image' | 'file';

export interface ChatAttachmentRef {
  id: string;
  filename: string;
  mimeType: string;
  kind: ChatAttachmentKind;
  sizeBytes?: number;
}

export interface FileAssetResponse {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: string;
  indexedAt: string | null;
}


export interface ResolvedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  kind: ChatAttachmentKind;
  imageDataUrl?: string;
  embeddedImageDataUrls?: string[];
  textExcerpt?: string;
  note?: string;
}

export function resolvedAttachmentHasVision(
  attachment: ResolvedAttachment
): boolean {
  return Boolean(
    attachment.imageDataUrl || attachment.embeddedImageDataUrls?.length
  );
}

export function buildDefaultAttachmentQuery(
  resolved: ResolvedAttachment[]
): string {
  if (resolved.some(resolvedAttachmentHasVision)) {
    return 'Describe and analyze the attached file(s), including any images or scanned pages.';
  }
  return 'Analyze the attached file(s) and summarize the key details, structure, and important information.';
}
