
export const PENDING_CHAT_SESSION_KEY = '__pending__';

type ActiveChatTurn = {
  controller: AbortController;
  sessionKey: string;
  socketId: string;
};

const turnsBySession = new Map<string, ActiveChatTurn>();

function sessionKeyFrom(sessionId?: string): string {
  return sessionId ?? PENDING_CHAT_SESSION_KEY;
}

function registerTurn(turn: ActiveChatTurn): void {
  turnsBySession.set(turn.sessionKey, turn);
}

function unregisterTurn(turn: ActiveChatTurn): void {
  turnsBySession.delete(turn.sessionKey);
}

export function beginChatTurn(socketId: string, sessionId?: string): AbortController {
  const sessionKey = sessionKeyFrom(sessionId);
  const existing = turnsBySession.get(sessionKey);
  if (existing && existing.socketId === socketId) {
    existing.controller.abort();
    unregisterTurn(existing);
  }

  const controller = new AbortController();
  registerTurn({ controller, sessionKey, socketId });
  return controller;
}

export function setChatTurnSession(socketId: string, sessionId: string): void {
  const pending = turnsBySession.get(PENDING_CHAT_SESSION_KEY);
  if (!pending || pending.socketId !== socketId) return;
  if (pending.sessionKey === sessionId) return;

  turnsBySession.delete(PENDING_CHAT_SESSION_KEY);
  pending.sessionKey = sessionId;
  turnsBySession.set(sessionId, pending);
}

export function detachChatTurn(socketId: string): void {
  for (const [key, turn] of [...turnsBySession.entries()]) {
    if (turn.socketId === socketId) {
      turn.controller.abort();
      turnsBySession.delete(key);
    }
  }
}

export function endChatTurn(socketId: string, sessionId?: string): void {
  const sessionKey = sessionId ?? PENDING_CHAT_SESSION_KEY;
  const turn = turnsBySession.get(sessionKey);
  if (turn?.socketId === socketId) {
    unregisterTurn(turn);
  }
}

export function abortChatTurn(socketId: string, sessionId?: string): boolean {
  if (sessionId) {
    return abortChatTurnBySession(sessionId);
  }

  let aborted = false;
  for (const turn of [...turnsBySession.values()]) {
    if (turn.socketId === socketId) {
      turn.controller.abort();
      unregisterTurn(turn);
      aborted = true;
    }
  }
  return aborted;
}

export function abortChatTurnBySession(sessionId: string): boolean {
  const turn = turnsBySession.get(sessionId);
  if (!turn) return false;
  turn.controller.abort();
  unregisterTurn(turn);
  return true;
}
