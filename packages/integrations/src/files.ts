import { prisma } from '@ai-assistant/database';
import { getFileStorage } from '@ai-assistant/storage';
import type {
  Capability,
  ExecutionContext,
  IntegrationConnector,
  JsonObject,
  ToolResult,
} from './types';

export const FILES_TOOL_NAMESPACES = ['files'] as const;

async function searchUserFiles(userId: string, query: string, limit = 8) {
  const q = query.trim();
  if (!q) {
    const recent = await prisma.fileAsset.findMany({
      where: { userId, status: 'ready' },
      orderBy: { indexedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        filename: true,
        mimeType: true,
        summary: true,
        status: true,
        chunkCount: true,
        indexedAt: true,
        source: true,
      },
    });
    return recent.map((f) => ({
      fileId: f.id,
      filename: f.filename,
      mimeType: f.mimeType,
      summary: f.summary,
      status: f.status,
      chunkCount: f.chunkCount,
      source: f.source ?? 'upload',
      excerpt: null,
    }));
  }

  const assets = await prisma.fileAsset.findMany({
    where: {
      userId,
      status: 'ready',
      OR: [
        { summary: { contains: q, mode: 'insensitive' } },
        { filename: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: limit,
    select: {
      id: true,
      filename: true,
      mimeType: true,
      summary: true,
      status: true,
      chunkCount: true,
      source: true,
    },
  });

  const chunks = await prisma.fileChunk.findMany({
    where: {
      content: { contains: q, mode: 'insensitive' },
      fileAsset: { userId, status: 'ready' },
    },
    take: limit * 2,
    include: {
      fileAsset: {
        select: {
          id: true,
          filename: true,
          mimeType: true,
          summary: true,
          status: true,
          source: true,
        },
      },
    },
  });

  const byFile = new Map<
    string,
    {
      fileId: string;
      filename: string;
      mimeType: string;
      summary: string | null;
      status: string;
      excerpt: string | null;
      chunkCount?: number;
      source?: string;
    }
  >();

  for (const a of assets) {
    byFile.set(a.id, {
      fileId: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      summary: a.summary,
      status: a.status,
      excerpt: null,
      chunkCount: a.chunkCount,
      source: a.source ?? 'upload',
    });
  }

  for (const c of chunks) {
    const a = c.fileAsset;
    const existing = byFile.get(a.id);
    const excerpt = c.content.slice(0, 400);
    if (!existing) {
      byFile.set(a.id, {
        fileId: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        summary: a.summary,
        status: a.status,
        excerpt,
      });
    } else if (!existing.excerpt) {
      existing.excerpt = excerpt;
    }
  }

  return [...byFile.values()].slice(0, limit);
}

export class FilesConnector implements IntegrationConnector {
  providerId = 'files';
  capabilities: Capability[] = ['search', 'read'];

  async executeTool(
    _connectionId: string,
    tool: string,
    args: JsonObject,
    ctx: ExecutionContext,
    _credentials: JsonObject
  ): Promise<ToolResult> {
    const userId = ctx.userId;
    if (!userId) {
      return { success: false, error: 'Missing userId' };
    }

    if (tool === 'files.search') {
      const query = String(args.query ?? '');
      const results = await searchUserFiles(userId, query);
      return { success: true, data: { query, results } };
    }

    if (tool === 'files.get_summary') {
      const fileId = String(args.fileId ?? '');
      if (!fileId) return { success: false, error: 'fileId required' };
      const asset = await prisma.fileAsset.findFirst({
        where: { id: fileId, userId },
      });
      if (!asset) return { success: false, error: 'File not found' };
      return {
        success: true,
        data: {
          fileId: asset.id,
          filename: asset.filename,
          status: asset.status,
          summary: asset.summary,
          analysis: asset.analysis,
          chunkCount: asset.chunkCount,
          indexedAt: asset.indexedAt,
        },
      };
    }

    if (tool === 'files.analyze_image') {
      const fileId = String(args.fileId ?? '');
      if (!fileId) return { success: false, error: 'fileId required' };

      const asset = await prisma.fileAsset.findFirst({
        where: { id: fileId, userId },
      });
      if (!asset) return { success: false, error: 'File not found' };
      if (!asset.mimeType.startsWith('image/')) {
        return { success: false, error: 'Not an image file' };
      }

      const bytes = await getFileStorage().getObject(asset.storageKey);
      const b64 = bytes.toString('base64');
      const imageDataUrl = `data:${asset.mimeType};base64,${b64}`;

      const baseUrl = (process.env.AI_SERVICE_URL ?? 'http://localhost:8050').replace(
        /\/$/,
        ''
      );
      const query =
        String(args.query ?? '') ||
        'Describe this image in detail including visible text (OCR).';

      const res = await fetch(`${baseUrl}/v1/chat/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          task: 'file_analysis',
          resolved_attachments: [
            {
              id: fileId,
              filename: asset.filename,
              mimeType: asset.mimeType,
              kind: 'image',
              imageDataUrl,
            },
          ],
        }),
      });

      if (!res.ok) {
        return { success: false, error: `Vision analysis failed: ${res.status}` };
      }

      const body = (await res.json()) as { text?: string };
      const caption = (body.text ?? '').trim();

      const analysis =
        asset.analysis && typeof asset.analysis === 'object'
          ? { ...(asset.analysis as Record<string, unknown>) }
          : {};
      analysis.caption = caption;
      analysis.ocr = caption;

      await prisma.fileAsset.update({
        where: { id: fileId },
        data: {
          analysis: analysis as object,
          summary: caption.slice(0, 500),
        },
      });

      return { success: true, data: { fileId, caption } };
    }

    if (tool === 'files.get_chunks') {
      const fileId = String(args.fileId ?? '');
      const query = String(args.query ?? '');
      const limit = Math.min(Number(args.limit ?? 5), 20);
      if (!fileId) return { success: false, error: 'fileId required' };

      const asset = await prisma.fileAsset.findFirst({
        where: { id: fileId, userId, status: 'ready' },
      });
      if (!asset) return { success: false, error: 'File not found or not indexed' };

      const chunks = await prisma.fileChunk.findMany({
        where: { fileAssetId: fileId },
        orderBy: { chunkIndex: 'asc' },
        take: 50,
      });

      const q = query.toLowerCase();
      const scored = chunks.map((c) => ({
        chunk: c,
        score: q && c.content.toLowerCase().includes(q) ? 2 : 1,
      }));
      scored.sort((a, b) => b.score - a.score);

      return {
        success: true,
        data: {
          fileId,
          filename: asset.filename,
          chunks: scored.slice(0, limit).map((s) => ({
            chunkIndex: s.chunk.chunkIndex,
            pageNumber: s.chunk.pageNumber,
            content: s.chunk.content,
          })),
        },
      };
    }

    return { success: false, error: `Unknown files tool: ${tool}` };
  }
}
