import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';
import { enforceSocketRateLimits, getClientIp } from '../lib/rate-limit';
import { getRequestSession, headersFromSocketHandshake } from '../utils/session';
import type { ChatOutgoingPayload } from '@ai-assistant/types';
import { processChatMessage } from '../services/chat.service';
import { registerVoiceTurnHandlers } from './voice-turn';

function extractToken(socket: Socket): string | undefined {
  const fromAuth = socket.handshake.auth?.token as string | undefined;
  if (fromAuth) return fromAuth;

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.split(' ')[1];
  }
  return undefined;
}

export function setupSocketIO(fastify: FastifyInstance) {
  const io = new Server(fastify.server, {
    cors: { origin: true, credentials: true },
  });

  io.on('connection', (socket) => {
    let userId: string | null = null;

    const resolveUser = async (token?: string) => {
      const session = await getRequestSession(
        headersFromSocketHandshake(socket.handshake.headers, token)
      );
      if (!session?.user) return false;
      userId = session.user.id;
      socket.emit('authenticated', { userId });
      return true;
    };

    const authReady = resolveUser(extractToken(socket)).catch((err) => {
      fastify.log.warn({ err }, 'Socket handshake auth failed');
      return false;
    });

    socket.on('authenticate', async (token: string) => {
      const ok = await resolveUser(token);
      if (!ok) {
        socket.emit('unauthorized', { error: 'Invalid authentication token' });
      }
    });

    registerVoiceTurnHandlers(socket, fastify, () => userId);

    socket.on('chat:message', async (data: ChatOutgoingPayload) => {
      await authReady;
      if (!userId) {
        socket.emit('chat:error', { error: 'Unauthorized. Please authenticate first.' });
        return;
      }

      if (!data?.text?.trim()) {
        socket.emit('chat:error', { error: 'Message text is required' });
        return;
      }

      try {
        const clientIp = getClientIp(socket.handshake.headers);
        enforceSocketRateLimits(clientIp, userId, 'chat:message');
      } catch (err) {
        const message =
          err instanceof AppError ? err.message : 'Too many requests. Please try again later.';
        socket.emit('chat:error', { error: message, details: message });
        return;
      }

      void (async () => {
        try {
          const result = await processChatMessage({
            userId,
            text: data.text.trim(),
            chatSessionId: data.chatSessionId,
            ragEnabled: data.ragEnabled,
            source: 'socket',
            onSessionCreated: (sessionId) => {
              socket.emit('chat:session_created', { chatSessionId: sessionId });
            },
            onChunk: (chunk, sessionId) => {
              socket.emit('chat:chunk', { chunk, chatSessionId: sessionId });
            },
            onTitleUpdated: (sessionId, title) => {
              socket.emit('chat:title_updated', { chatSessionId: sessionId, title });
            },
          });

          socket.emit('chat:message_saved', { message: result.userMessage });
          socket.emit('chat:end', {
            message: result.assistantMessage,
            chatSessionId: result.sessionId,
          });
        } catch (err) {
          const message =
            err instanceof AppError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Unknown error';
          const details = err instanceof AppError ? err.details : undefined;

          fastify.log.error({ err, userId, socketId: socket.id }, 'chat:message failed');

          socket.emit('chat:error', {
            error: message,
            details: message,
            ...(details !== undefined && { debug: details }),
          });
        }
      })();
    });
  });

  return io;
}
