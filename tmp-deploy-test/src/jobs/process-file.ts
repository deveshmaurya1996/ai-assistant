import { prisma } from '@ai-assistant/database';
import {
  extractFileContent,
  extractToSummary,
  TEXT_EXCERPT_MAX,
} from '@ai-assistant/file-processing';
import { getFileStorage } from '@ai-assistant/storage';

const CHUNK_SIZE = 1_500;
const CHUNK_OVERLAP = 200;

type FileAnalysisJson = {
  summary?: string;
  caption?: string;
  ocr?: string;
  textExcerpt?: string;
  mimeType?: string;
  kind?: string;
};

function chunkText(text: string): Array<{ content: string; pageNumber?: number }> {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: Array<{ content: string; pageNumber?: number }> = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    const slice = normalized.slice(start, end).trim();
    if (slice) {
      chunks.push({ content: slice, pageNumber: undefined });
    }
    if (end >= normalized.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

export async function processFileAsset(userId: string, fileAssetId: string): Promise<void> {
  const asset = await prisma.fileAsset.findFirst({
    where: { id: fileAssetId, userId },
  });
  if (!asset) {
    console.warn('[ingestion] process-file: asset not found', fileAssetId);
    return;
  }

  await prisma.fileAsset.update({
    where: { id: fileAssetId },
    data: { status: 'processing' },
  });

  try {
    const bytes = await getFileStorage().getObject(asset.storageKey);
    const extracted = await extractFileContent(bytes, asset.mimeType, asset.filename);

    const analysis: FileAnalysisJson = {
      mimeType: asset.mimeType,
      kind: extracted.kind,
    };
    let fullText = extracted.textExcerpt ?? '';

    if (extracted.kind === 'image') {
      analysis.caption = `Image: ${asset.filename}`;
      analysis.summary = `Uploaded image ${asset.filename}. Live vision runs on demand for detailed queries.`;
      fullText = analysis.summary;
    } else if (extracted.imageDataUrl || extracted.embeddedImageDataUrls?.length) {
      const imageCount =
        (extracted.imageDataUrl ? 1 : 0) + (extracted.embeddedImageDataUrls?.length ?? 0);
      analysis.summary = `Document ${asset.filename} includes ${imageCount} embedded image(s).`;
      if (fullText) {
        analysis.textExcerpt = fullText.slice(0, TEXT_EXCERPT_MAX);
      } else {
        fullText = analysis.summary;
      }
    } else if (extracted.note && !fullText) {
      analysis.summary = extracted.note;
      fullText = extracted.note;
    } else if (fullText) {
      analysis.textExcerpt = fullText.slice(0, TEXT_EXCERPT_MAX);
    }

    const summary =
      analysis.summary ??
      (fullText ? extractToSummary(fullText, 500) : `File: ${asset.filename}`);

    const textChunks = fullText ? chunkText(fullText) : [];
    if (textChunks.length === 0 && summary) {
      textChunks.push({ content: summary });
    }

    await prisma.fileChunk.deleteMany({ where: { fileAssetId } });

    if (textChunks.length > 0) {
      await prisma.fileChunk.createMany({
        data: textChunks.map((c, chunkIndex) => ({
          fileAssetId,
          chunkIndex,
          pageNumber: c.pageNumber ?? null,
          content: c.content,
        })),
      });
    }

    await prisma.fileAsset.update({
      where: { id: fileAssetId },
      data: {
        status: 'ready',
        summary,
        analysis: analysis as object,
        chunkCount: textChunks.length,
        indexedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[ingestion] process-file failed', fileAssetId, message);
    await prisma.fileAsset.update({
      where: { id: fileAssetId },
      data: { status: 'failed', summary: `Processing failed: ${message}` },
    });
  }
}
