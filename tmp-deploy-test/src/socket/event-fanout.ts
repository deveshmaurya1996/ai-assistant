import type { Server } from 'socket.io';
import { subscribeEvents, EventNames, type DomainEvent } from '@ai-assistant/events';
import type { ToolEventPayload } from '@ai-assistant/events';

let io: Server | null = null;
let fanoutStarted = false;

export function setSocketServer(server: Server) {
  io = server;
}

function emitToUser(userId: string, event: string, data: unknown) {
  if (!io) return;
  for (const [, socket] of io.sockets.sockets) {
    const authUserId = (socket as unknown as { data?: { userId?: string } }).data?.userId;
    if (authUserId === userId) {
      socket.emit(event, data);
    }
  }
}

export function attachUserToSocket(socketId: string, userId: string) {
  if (!io) return;
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    (socket as unknown as { data: { userId: string } }).data = { userId };
  }
}

export function startEventFanout() {
  if (fanoutStarted) return;
  fanoutStarted = true;

  subscribeEvents((event: DomainEvent) => {
    const payload = event.payload as ToolEventPayload & { userId?: string };
    if (!payload?.userId) return;

    switch (event.name) {
      case EventNames.TOOL_CALLED:
        emitToUser(payload.userId, 'tool:start', {
          executionId: payload.executionId,
          tool: payload.tool,
        });
        break;
      case EventNames.TOOL_PROGRESS:
        emitToUser(payload.userId, 'tool:progress', {
          executionId: payload.executionId,
          tool: payload.tool,
          message: payload.message,
          progress: payload.progress,
        });
        break;
      case EventNames.TOOL_COMPLETED:
        emitToUser(payload.userId, 'tool:complete', {
          executionId: payload.executionId,
          tool: payload.tool,
          result: payload.result,
        });
        break;
      case EventNames.TOOL_FAILED:
      case EventNames.TOOL_CANCELLED:
        emitToUser(payload.userId, 'tool:failed', {
          executionId: payload.executionId,
          tool: payload.tool,
          error: payload.error,
        });
        break;
      case EventNames.NOTIFICATION_CREATED:
        emitToUser(payload.userId, 'notification:created', payload);
        break;
      default:
        break;
    }
  });
  console.log('[event-fanout] subscribed to domain events');
}
