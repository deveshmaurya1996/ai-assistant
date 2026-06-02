import type { ChatAttachmentRef, ResolvedAttachment } from '@ai-assistant/types';
import { extractFileContent, TEXT_EXCERPT_MAX } from '@ai-assistant/file-processing';
import { prisma } from '@ai-assistant/database';
import {
  assertFileAccess,
  enqueueFileIndex,
  readUserFileBytes,
} from './file.service';
import { getSessionFileContext } from './file-registry.service';

const CONTEXT_PREVIEW_MAX = 4_000;

export { toChatAttachmentRef, assertFileAccess } from './file.service';

type FileAnalysisJson = {
  summary?: string;
  caption?: string;
  ocr?: string;
  objects?: string[];
  textExcerpt?: string;
};

export function queryReferencesSessionFiles(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const signals = [
    'page ',
    'uploaded',
    'my pdf',
    'my document',
    'attached file',
    'attached pdf',
    'the contract',
    'my file',
    'that file',
    'this file',
    'the document',
    'in the pdf',
    'in the document',
    'summarize',
    'summary',
    'what did page',
    'what does page',
  ];
  return signals.some((s) => q.includes(s));
}

function analysisFromAsset(asset: {
  analysis: unknown;
  summary: string | null;
}): FileAnalysisJson | null {
  if (asset.analysis && typeof asset.analysis === 'object') {
    return asset.analysis as FileAnalysisJson;
  }
  if (asset.summary) {
    return { summary: asset.summary };
  }
  return null;
}

async function resolveFromRegistry(
  userId: string,
  ref: ChatAttachmentRef,
  base: ResolvedAttachment
): Promise<ResolvedAttachment | null> {
  const asset = await assertFileAccess(userId, ref.id);
  if (asset.status !== 'ready' || !asset.indexedAt) {
    return null;
  }

  const analysis = analysisFromAsset(asset);
  if (!analysis) return null;

  const parts: string[] = [];
  if (analysis.summary) parts.push(analysis.summary);
  if (analysis.caption) parts.push(`Image: ${analysis.caption}`);
  if (analysis.ocr) parts.push(`OCR: ${analysis.ocr}`);
  if (analysis.textExcerpt) {
    parts.push(
      `[Attached file: ${asset.filename}]\n${analysis.textExcerpt.slice(0, TEXT_EXCERPT_MAX)}`
    );
  }

  if (parts.length === 0) return null;

  return {
    ...base,
    textExcerpt: parts.join('\n\n').slice(0, TEXT_EXCERPT_MAX),
  };
}

async function resolveInline(
  userId: string,
  ref: ChatAttachmentRef,
  base: ResolvedAttachment,
  options?: { query?: string; allowVision?: boolean }
): Promise<ResolvedAttachment> {
  const asset = await assertFileAccess(userId, ref.id);

  if (asset.status !== 'ready') {
    enqueueFileIndex(userId, ref.id);
  }

  const indexingNote =
    asset.status === 'processing' || asset.status === 'pending'
      ? `File ${asset.filename} is still being indexed; answering from partial content.`
      : asset.status === 'failed'
        ? `File ${asset.filename} indexing failed; using inline extract only.`
        : undefined;

  try {
    const bytes = await readUserFileBytes(asset.storageKey);
    const isImage = ref.kind === 'image' || asset.mimeType.startsWith('image/');
    const wantVision = isImage && options?.allowVision !== false;

    const extracted = await extractFileContent(bytes, asset.mimeType, asset.filename, {
      includeImageDataUrl: wantVision,
    });

    if (isImage && !wantVision) {
      const analysis = analysisFromAsset(asset);
      const caption =
        analysis?.caption ??
        analysis?.summary ??
        `Image attached: ${asset.filename} (use cached analysis; live vision only when needed).`;
      return {
        ...base,
        kind: 'image',
        textExcerpt: caption.slice(0, TEXT_EXCERPT_MAX),
        note: indexingNote,
      };
    }

    const textExcerpt =
      extracted.textExcerpt ??
      (extracted.note && extracted.kind === 'file' ? extracted.note : undefined);

    return {
      ...base,
      kind: extracted.kind,
      textExcerpt,
      note: indexingNote ?? (textExcerpt ? undefined : extracted.note),
      imageDataUrl: extracted.imageDataUrl,
      embeddedImageDataUrls: extracted.embeddedImageDataUrls,
    };
  } catch (err) {
    return {
      ...base,
      note:
        indexingNote ??
        `Could not read file ${asset.filename}: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

function isImageRef(ref: ChatAttachmentRef): boolean {
  return ref.kind === 'image' || ref.mimeType.startsWith('image/');
}

export async function resolveAttachment(
  userId: string,
  ref: ChatAttachmentRef,
  options?: { preferRegistry?: boolean; query?: string; forceInline?: boolean }
): Promise<ResolvedAttachment> {
  const base: ResolvedAttachment = {
    id: ref.id,
    filename: ref.filename,
    mimeType: ref.mimeType,
    kind: ref.kind,
  };

  if (options?.forceInline || isImageRef(ref)) {
    return resolveInline(userId, ref, base, {
      query: options?.query,
      allowVision: isImageRef(ref),
    });
  }

  const preferRegistry = options?.preferRegistry !== false;
  if (preferRegistry) {
    const fromRegistry = await resolveFromRegistry(userId, ref, base);
    if (fromRegistry) return fromRegistry;
  }

  return resolveInline(userId, ref, base, { query: options?.query });
}

export async function resolveAttachments(
  userId: string,
  refs: ChatAttachmentRef[],
  options?: {
    query?: string;
    sessionId?: string;
    forceInline?: boolean;
  }
): Promise<ResolvedAttachment[]> {
  const forceInline = options?.forceInline !== false;
  const mergedRefs = [...refs];
  if (
    options?.sessionId &&
    refs.length === 0 &&
    queryReferencesSessionFiles(options.query ?? '')
  ) {
    const ctx = await getSessionFileContext(options.sessionId);
    for (const fileId of ctx.lastReferencedFileIds ?? []) {
      const asset = await prisma.fileAsset.findFirst({
        where: { id: fileId, userId },
      });
      if (asset) {
        mergedRefs.push({
          id: asset.id,
          filename: asset.filename,
          mimeType: asset.mimeType,
          kind: asset.mimeType.startsWith('image/') ? 'image' : 'file',
          sizeBytes: asset.sizeBytes,
        });
      }
    }
  }

  const out: ResolvedAttachment[] = [];
  for (const ref of mergedRefs) {
    out.push(
      await resolveAttachment(userId, ref, {
        query: options?.query,
        forceInline,
        preferRegistry: !forceInline,
      })
    );
  }
  return out;
}

export function buildAttachmentContext(
  userText: string,
  resolved: ResolvedAttachment[]
): string {
  const parts: string[] = [];
  if (userText.trim()) parts.push(userText.trim());

  for (const item of resolved) {
    if (item.note) {
      parts.push(`[${item.note}]`);
    } else if (item.kind === 'image') {
      parts.push(`[Attached image: ${item.filename}]`);
    } else if (item.textExcerpt) {
      const preview = item.textExcerpt.slice(0, CONTEXT_PREVIEW_MAX);
      const suffix =
        item.textExcerpt.length > CONTEXT_PREVIEW_MAX ? '\n…(truncated)' : '';
      parts.push(`[Attached file: ${item.filename}]\n${preview}${suffix}`);
    }
  }

  return parts.join('\n\n');
}

export async function loadFileChunksForQuery(
  userId: string,
  fileId: string,
  query: string,
  limit = 5
): Promise<string> {
  const pageMatch = query.match(/\bpage\s+(\d+)\b/i);
  const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : undefined;

  const chunks = await prisma.fileChunk.findMany({
    where: {
      fileAssetId: fileId,
      fileAsset: { userId },
      ...(pageNumber ? { pageNumber } : {}),
    },
    orderBy: { chunkIndex: 'asc' },
    take: 50,
  });

  if (chunks.length === 0) return '';

  const q = query.toLowerCase();
  const scored = chunks.map((c) => {
    const text = c.content.toLowerCase();
    const score =
      (q && text.includes(q) ? 2 : 0) +
      (pageNumber && c.pageNumber === pageNumber ? 3 : 0) +
      1;
    return { chunk: c, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, limit).map((s) => s.chunk);
  return selected
    .map((c) => {
      const header = c.pageNumber
        ? `[${fileId} p.${c.pageNumber}]`
        : `[${fileId} #${c.chunkIndex}]`;
      return `${header}\n${c.content}`;
    })
    .join('\n\n');
}

export async function buildRetrievalContextForAttachments(
  userId: string,
  refs: ChatAttachmentRef[],
  query: string,
  sessionId?: string
): Promise<string> {
  const fileIds = new Set(refs.map((r) => r.id));

  if (sessionId && queryReferencesSessionFiles(query)) {
    const ctx = await getSessionFileContext(sessionId);
    for (const id of ctx.lastReferencedFileIds ?? []) {
      fileIds.add(id);
    }
  }

  const parts: string[] = [];
  for (const fileId of fileIds) {
    const asset = await prisma.fileAsset.findFirst({
      where: { id: fileId, userId },
    });
    if (!asset) continue;

    if (asset.status !== 'ready') {
      parts.push(
        `[File ${asset.filename}] Indexing in progress (status: ${asset.status}).`
      );
      continue;
    }

    if (asset.summary) {
      parts.push(`[File ${asset.filename} summary]\n${asset.summary}`);
    }

    const chunkText = await loadFileChunksForQuery(userId, fileId, query);
    if (chunkText) {
      parts.push(`[File ${asset.filename} excerpts]\n${chunkText}`);
    }
  }
  return parts.join('\n\n');
}
