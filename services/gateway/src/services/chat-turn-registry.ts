type ActiveChatTurn = {
  controller: AbortController;
  sessionId?: string;
  socketId: string;
};

const turnsBySocket = new Map<string, ActiveChatTurn>();
const turnsBySession = new Map<string, ActiveChatTurn>();

function registerTurn(turn: ActiveChatTurn): void {
  turnsBySocket.set(turn.socketId, turn);
  if (turn.sessionId) {
    turnsBySession.set(turn.sessionId, turn);
  }
}

function unregisterTurn(turn: ActiveChatTurn): void {
  turnsBySocket.delete(turn.socketId);
  if (turn.sessionId) {
    turnsBySession.delete(turn.sessionId);
  }
}

export function beginChatTurn(socketId: string, sessionId?: string): AbortController {
  if (sessionId) {
    const sessionTurn = turnsBySession.get(sessionId);
    if (sessionTurn) {
      sessionTurn.controller.abort();
      unregisterTurn(sessionTurn);
    }
  }

  const existing = turnsBySocket.get(socketId);
  if (existing) {
    existing.controller.abort();
    unregisterTurn(existing);
  }

  const controller = new AbortController();
  registerTurn({ controller, sessionId, socketId });
  return controller;
}

export function setChatTurnSession(socketId: string, sessionId: string): void {
  const turn = turnsBySocket.get(socketId);
  if (!turn) return;
  if (turn.sessionId) {
    turnsBySession.delete(turn.sessionId);
  }
  turn.sessionId = sessionId;
  turnsBySession.set(sessionId, turn);
}

export function detachChatTurn(socketId: string): void {
  turnsBySocket.delete(socketId);
}

export function endChatTurn(socketId: string): void {
  const attached = turnsBySocket.get(socketId);
  if (attached) {
    unregisterTurn(attached);
    return;
  }

  for (const turn of turnsBySession.values()) {
    if (turn.socketId === socketId) {
      unregisterTurn(turn);
      return;
    }
  }
}

export function abortChatTurn(socketId: string, sessionId?: string): boolean {
  if (sessionId) {
    return abortChatTurnBySession(sessionId);
  }

  const turn = turnsBySocket.get(socketId);
  if (!turn) return false;
  turn.controller.abort();
  unregisterTurn(turn);
  return true;
}

export function abortChatTurnBySession(sessionId: string): boolean {
  const turn = turnsBySession.get(sessionId);
  if (!turn) return false;
  turn.controller.abort();
  unregisterTurn(turn);
  return true;
}
