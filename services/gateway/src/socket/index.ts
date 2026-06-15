import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';
import { enforceSocketRateLimits, getClientIp } from '../lib/rate-limit';
import { getRequestSession, headersFromSocketHandshake } from '../utils/session';
import type { ChatOutgoingPayload } from '@ai-assistant/types';
import {
  processChatMessage,
  processPendingConfirmAccept,
  processInlineConfirmCancel,
} from '../services/chat.service';
import {
  abortChatTurn,
  abortChatTurnBySession,
  beginChatTurn,
  detachChatTurn,
  endChatTurn,
  PENDING_CHAT_SESSION_KEY,
  setChatTurnSession,
} from '../services/chat-turn-registry';
import {
  clearPendingConfirm,
  getPendingConfirm,
  isConfirmReply,
} from '../services/pending-confirm.service';
import { registerVoiceTurnHandlers } from './voice-turn';
import { setSocketServer, attachUserToSocket, startEventFanout } from './event-fanout';
import { toolRuntimeFetch } from '../lib/runtime-clients';

function chatEndModelExtras(
  modelUsed?: string,
  modelLabel?: string
): { modelUsed?: string; modelLabel?: string } {
  const extras: { modelUsed?: string; modelLabel?: string } = {};
  if (modelUsed) extras.modelUsed = modelUsed;
  if (modelLabel) extras.modelLabel = modelLabel;
  return extras;
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

    socket.on('chat:abort', (data: { chatSessionId?: string }) => {
      if (data?.chatSessionId) {
        abortChatTurnBySession(data.chatSessionId);
      } else {
        abortChatTurn(socket.id);
      }
    });

    socket.on('disconnect', () => {
      detachChatTurn(socket.id);
    });

    socket.on('chat:message', async (data: ChatOutgoingPayload) => {
      await authReady;
      if (!userId) {
        socket.emit('chat:error', { error: 'Unauthorized. Please authenticate first.' });
        return;
      }

      const hasText = Boolean(data?.text?.trim());
      const hasAttachments = Boolean(data?.attachments?.length);
      if (!hasText && !hasAttachments) {
        socket.emit('chat:error', { error: 'Message text or attachment is required' });
        return;
      }
      if (data.attachments && data.attachments.length > 4) {
        socket.emit('chat:error', { error: 'Maximum 4 attachments per message' });
        return;
      }
      const deviceTimezone = data.timezone?.trim() || undefined;
      if (!deviceTimezone) {
        fastify.log.warn(
          { userId, socketId: socket.id, textPreview: data.text?.slice(0, 80) },
          '[chat] chat:message missing device timezone — reminder scheduling may fail'
        );
      } else {
        fastify.log.info(
          {
            userId,
            socketId: socket.id,
            timezone: deviceTimezone,
            textPreview: data.text?.slice(0, 80),
            hasSession: Boolean(data.chatSessionId),
          },
          '[chat] chat:message received'
        );
      }

      try {
        const clientIp = getClientIp(socket.handshake.headers);
        enforceSocketRateLimits(clientIp, userId, 'chat:message');
      } catch (err) {
        const message =
          err instanceof AppError ? err.message : 'Too many requests. Please try again later.';
        socket.emit('chat:error', {
          chatSessionId: data.chatSessionId ?? PENDING_CHAT_SESSION_KEY,
          error: message,
          details: message,
        });
        return;
      }

      void (async () => {
        let activeTurnSessionKey = data.chatSessionId ?? PENDING_CHAT_SESSION_KEY;
        const turnAbort = beginChatTurn(socket.id, data.chatSessionId);
        try {
          const trimmedText = data.text?.trim() ?? '';
          const chatSessionId = data.chatSessionId;

          if (chatSessionId && !data.confirmed) {
            const pending = getPendingConfirm(chatSessionId);
            if (pending && pending.userId === userId) {
              const reply = isConfirmReply(trimmedText);
              if (reply === 'yes') {
                clearPendingConfirm(chatSessionId);
                const result = await processPendingConfirmAccept({
                  userId,
                  chatSessionId,
                  pending,
                  replyText: trimmedText,
                  ragEnabled: data.ragEnabled,
                  personalityId: data.personalityId,
                  assistantDisplayName: data.assistantDisplayName,
                  agentSource:
                    (data as { source?: 'chat' | 'voice' }).source === 'voice'
                      ? 'voice'
                      : 'chat',
                  signal: turnAbort.signal,
                  onChunk: (chunk, sessionId) => {
                    socket.emit('chat:chunk', { chunk, chatSessionId: sessionId });
                  },
                  onTitleUpdated: (sessionId, title) => {
                    socket.emit('chat:title_updated', { chatSessionId: sessionId, title });
                  },
                });
                if ('aborted' in result && result.aborted) {
                  if (result.assistantMessage) {
                    socket.emit('chat:end', {
                      message: result.assistantMessage,
                      chatSessionId: result.sessionId,
                    });
                  } else {
                    socket.emit('chat:aborted', { chatSessionId: result.sessionId });
                  }
                  return;
                }
                socket.emit('chat:message_saved', { message: result.userMessage });
                socket.emit('chat:end', {
                  message: result.assistantMessage!,
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
                  personalityId: data.personalityId,
                  assistantDisplayName: data.assistantDisplayName,
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
            attachments: data.attachments,
            chatSessionId: data.chatSessionId,
            ragEnabled: data.ragEnabled,
            confirmed: data.confirmed,
            personalityId: data.personalityId,
            assistantDisplayName: data.assistantDisplayName,
            timezone: deviceTimezone,
            source: 'socket',
            signal: turnAbort.signal,
            agentSource:
              (data as { source?: 'chat' | 'voice' }).source === 'voice' ? 'voice' : 'chat',
            onSessionCreated: (sessionId) => {
              setChatTurnSession(socket.id, sessionId);
              activeTurnSessionKey = sessionId;
              socket.emit('chat:session_created', { chatSessionId: sessionId });
            },
            onChunk: (chunk, sessionId) => {
              setChatTurnSession(socket.id, sessionId);
              activeTurnSessionKey = sessionId;
              socket.emit('chat:chunk', { chunk, chatSessionId: sessionId });
            },
            onStatus: (message, sessionId) => {
              setChatTurnSession(socket.id, sessionId);
              activeTurnSessionKey = sessionId;
              socket.emit('chat:status', { message, chatSessionId: sessionId });
            },
            onTitleUpdated: (sessionId, title) => {
              socket.emit('chat:title_updated', { chatSessionId: sessionId, title });
            },
          });

          if ('aborted' in result && result.aborted) {
            if (result.assistantMessage) {
              socket.emit('chat:end', {
                message: result.assistantMessage,
                chatSessionId: result.sessionId,
              });
            } else {
              socket.emit('chat:aborted', { chatSessionId: result.sessionId });
            }
            return;
          }

          if ('requiresConfirmation' in result && result.requiresConfirmation) {
            socket.emit('chat:message_saved', { message: result.userMessage });
            socket.emit('chat:end', {
              message: result.assistantMessage!,
              chatSessionId: result.sessionId,
            });
            return;
          }

          socket.emit('chat:message_saved', { message: result.userMessage });
          socket.emit('chat:end', {
            message: result.assistantMessage!,
            chatSessionId: result.sessionId,
            ...chatEndModelExtras(result.modelUsed, result.modelLabel),
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
            chatSessionId: activeTurnSessionKey,
            error: message,
            details: message,
            ...(details !== undefined && { debug: details }),
          });
        } finally {
          endChatTurn(socket.id, activeTurnSessionKey);
        }
      })();
    });

    socket.on('chat:confirm_pending', async (data: { chatSessionId?: string }) => {
      await authReady;
      if (!userId) {
        socket.emit('chat:error', { error: 'Unauthorized. Please authenticate first.' });
        return;
      }
      const chatSessionId = data.chatSessionId?.trim();
      if (!chatSessionId) {
        socket.emit('chat:error', { error: 'chatSessionId is required' });
        return;
      }

      void (async () => {
        const turnAbort = beginChatTurn(socket.id, chatSessionId);
        try {
          const pending = getPendingConfirm(chatSessionId);
          if (!pending || pending.userId !== userId) {
            socket.emit('chat:error', {
              chatSessionId,
              error: 'No pending action to confirm.',
            });
            return;
          }
          clearPendingConfirm(chatSessionId);
          const result = await processPendingConfirmAccept({
            userId,
            chatSessionId,
            pending,
            replyText: 'yes',
            agentSource: 'chat',
            signal: turnAbort.signal,
            onChunk: (chunk, sessionId) => {
              socket.emit('chat:chunk', { chunk, chatSessionId: sessionId });
            },
            onTitleUpdated: (sessionId, title) => {
              socket.emit('chat:title_updated', { chatSessionId: sessionId, title });
            },
          });
          socket.emit('chat:message_saved', { message: result.userMessage });
          socket.emit('chat:end', {
            message: result.assistantMessage!,
            chatSessionId: result.sessionId,
          });
        } catch (err) {
          const message =
            err instanceof AppError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Unknown error';
          socket.emit('chat:error', { chatSessionId, error: message, details: message });
        } finally {
          endChatTurn(socket.id, chatSessionId);
        }
      })();
    });
  });

  return io;
}
