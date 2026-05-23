import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';
import { getRequestSession, headersFromSocketHandshake } from '../utils/session';
import { processChatMessage } from '../services/chat.service';

interface ChatMessageData {
  text: string;
  chatSessionId?: string;
  ragEnabled?: boolean;
}

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

    resolveUser(extractToken(socket)).catch((err) => {
      fastify.log.warn({ err }, 'Socket handshake auth failed');
    });

    socket.on('authenticate', async (token: string) => {
      const ok = await resolveUser(token);
      if (!ok) {
        socket.emit('unauthorized', { error: 'Invalid authentication token' });
      }
    });

    socket.on('chat:message', async (data: ChatMessageData) => {
      if (!userId) {
        socket.emit('chat:error', { error: 'Unauthorized. Please authenticate first.' });
        return;
      }

      if (!data?.text?.trim()) {
        socket.emit('chat:error', { error: 'Message text is required' });
        return;
      }

      try {
        const result = await processChatMessage({
          userId,
          text: data.text.trim(),
          chatSessionId: data.chatSessionId,
          ragEnabled: data.ragEnabled,
          onSessionCreated: (sessionId) => {
            socket.emit('chat:session_created', { chatSessionId: sessionId });
          },
          onChunk: (chunk, sessionId) => {
            socket.emit('chat:chunk', { chunk, chatSessionId: sessionId });
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
          error: 'An error occurred while communicating with the AI service.',
          details: message,
          ...(details !== undefined && { debug: details }),
        });
      }
    });
  });

  return io;
}
