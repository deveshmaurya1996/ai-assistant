import { Readable } from 'node:stream';
import { FastifyInstance } from 'fastify';
import { normalizeMimeType } from '@ai-assistant/file-processing';
import { getFileStorage, getLocalDiskStorage } from '@ai-assistant/storage';
import { authenticateRequest } from '../utils/auth.middleware';
import { requireUserId } from '../lib/auth';
import { sendError } from '../lib/errors';
import { getFileRegistryRecord } from '../services/file-registry.service';
import {
  enqueueFileIndex,
  getUserFileForDownload,
  toChatAttachmentRef,
  uploadUserFile,
} from '../services/file.service';

export async function fileRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  fastify.post('/upload', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const parts = request.parts();
      let buffer: Buffer | null = null;
      let filename = 'upload';
      let mimeFromPart = 'application/octet-stream';
      let source: 'upload' | 'chat' = 'upload';

      for await (const part of parts) {
        if (part.type === 'file') {
          buffer = await part.toBuffer();
          filename = part.filename || filename;
          mimeFromPart = part.mimetype || mimeFromPart;
        } else if (part.type === 'field') {
          const value = String(part.value ?? '');
          if (part.fieldname === 'source' && value === 'chat') {
            source = value;
          }
        }
      }

      if (!buffer) return reply.code(400).send({ error: 'No file' });

      const { fileTypeFromBuffer } = await import('file-type');
      const sniffed = await fileTypeFromBuffer(buffer);
      const mimeType = normalizeMimeType(
        sniffed?.mime ?? mimeFromPart ?? 'application/octet-stream',
        filename
      );

      let updated;
      try {
        updated = await uploadUserFile({
          userId,
          filename,
          mimeType,
          buffer,
          source,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        if (message.includes('too large')) {
          return reply.code(413).send({ error: message });
        }
        throw err;
      }

      if (updated.status === 'pending') {
        enqueueFileIndex(userId, updated.id);
      }

      return reply.code(201).send({
        ...toChatAttachmentRef(updated),
        userId: updated.userId,
        storageKey: updated.storageKey,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        indexedAt: updated.indexedAt?.toISOString() ?? null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/:id/status', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const asset = await getFileRegistryRecord(userId, id);
      return {
        id: asset.id,
        filename: asset.filename,
        mimeType: asset.mimeType,
        status: asset.status,
        summary: asset.summary,
        chunkCount: asset.chunkCount,
        indexedAt: asset.indexedAt?.toISOString() ?? null,
        createdAt: asset.createdAt.toISOString(),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/:id', async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const asset = await getUserFileForDownload(userId, id);

      reply.header('Content-Type', asset.mimeType);
      reply.header(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(asset.filename)}"`
      );

      const local = getLocalDiskStorage();
      if (local) {
        return reply.send(local.createReadStream(asset.storageKey));
      }

      const buffer = await getFileStorage().getObject(asset.storageKey);
      return reply.send(Readable.from(buffer));
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
