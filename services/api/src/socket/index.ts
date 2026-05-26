import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';
import { enforceSocketRateLimits, getClientIp } from '../lib/rate-limit';
import { getRequestSession, headersFromSocketHandshake } from '../utils/session';
import type { ChatOutgoingPayload } from '@ai-assistant/types';
import {
  processChatMessage,
  processInlineConfirmAccept,
  processInlineConfirmCancel,
} from '../services/chat.service';
import {
  clearPendingConfirm,
  getPendingConfirm,
  isConfirmReply,
} from '../services/pending-confirm.service';
import { registerVoiceTurnHandlers } from './voice-turn';
import { setSocketServer, attachUserToSocket, startEventFanout } from './event-fanout';
import { toolRuntimeFetch } from '../lib/runtime-clients';

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

  setSocketServer(io);

  io.on('connection', (socket) => {
    let userId: string | null = null;

    const resolveUser = async (token?: string) => {
      const session = await getRequestSession(
        headersFromSocketHandshake(socket.handshake.headers, token)
      );
      if (!session?.user) return false;
      userId = session.user.id;
      attachUserToSocket(socket.id, userId);
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

    socket.on('execution:cancel', async (data: { executionId: string }) => {
      await authReady;
      if (!userId || !data?.executionId) return;
      await toolRuntimeFetch(`/v1/executions/${data.executionId}`, { method: 'DELETE' });
    });

    socket.on('voice:interrupt', async (data: { sessionId?: string; executionId?: string }) => {
      await authReady;
      if (!userId) return;
      if (data?.executionId) {
        await toolRuntimeFetch(`/v1/executions/${data.executionId}`, { method: 'DELETE' });
      }
      socket.emit('voice:interrupted', { sessionId: data?.sessionId });
    });

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
          const trimmedText = data.text.trim();
          const chatSessionId = data.chatSessionId;

          if (chatSessionId && !data.confirmed) {
            const pending = getPendingConfirm(chatSessionId);
            if (pending && pending.userId === userId) {
              const reply = isConfirmReply(trimmedText);
              if (reply === 'yes') {
                clearPendingConfirm(chatSessionId);
                const result = await processInlineConfirmAccept({
                  userId,
                  chatSessionId,
                  pending,
                  replyText: trimmedText,
                  ragEnabled: data.ragEnabled,
                  agentSource:
                    (data as { source?: 'chat' | 'voice' }).source === 'voice'
                      ? 'voice'
                      : 'chat',
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
                return;
              }

              if (reply === 'no') {
                clearPendingConfirm(chatSessionId);
                const result = await processInlineConfirmCancel({
                  userId,
                  chatSessionId,
                  replyText: trimmedText,
                });
                socket.emit('chat:message_saved', { message: result.userMessage });
                socket.emit('chat:end', {
                  message: result.assistantMessage,
                  chatSessionId: result.sessionId,
                });
                return;
              }

              clearPendingConfirm(chatSessionId);
            }
          }

          const result = await processChatMessage({
            userId,
            text: trimmedText,
            chatSessionId: data.chatSessionId,
            ragEnabled: data.ragEnabled,
            confirmed: data.confirmed,
            source: 'socket',
            agentSource:
              (data as { source?: 'chat' | 'voice' }).source === 'voice' ? 'voice' : 'chat',
            onSessionCreated: (sessionId) => {
              socket.emit('chat:session_created', { chatSessionId: sessionId });
            },
            onChunk: (chunk, sessionId) => {
              socket.emit('chat:chunk', { chunk, chatSessionId: sessionId });
            },
            onTitleUpdated: (sessionId, title) => {
              socket.emit('chat:title_updated', { chatSessionId: sessionId, title });
            },
            onActionConfirmRequired: (payload) => {
              socket.emit('chat:action_confirm_required', {
                tool: payload.tool,
                args: payload.args,
                executionId: payload.executionId,
              });
            },
          });

          if ('requiresConfirmation' in result && result.requiresConfirmation) {
            if ('inlineConfirm' in result && result.inlineConfirm) {
              socket.emit('chat:message_saved', { message: result.userMessage });
              socket.emit('chat:end', {
                message: result.assistantMessage,
                chatSessionId: result.sessionId,
              });
            }
            return;
          }

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
