import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_CHAT_SESSION_KEY,
  beginChatTurn,
  endChatTurn,
  setChatTurnSession,
} from '../chat-turn-registry.js';

describe('chat-turn-registry parallel sessions', () => {
  it('does not abort sessionA when beginning sessionB on same socket', () => {
    const socketId = 'sock-1';
    const ctrlA = beginChatTurn(socketId, 'session-a');
    const ctrlB = beginChatTurn(socketId, 'session-b');

    assert.equal(ctrlA.signal.aborted, false);
    assert.equal(ctrlB.signal.aborted, false);

    endChatTurn(socketId, 'session-a');
    endChatTurn(socketId, 'session-b');
  });

  it('aborts prior turn when beginning twice for same session', () => {
    const socketId = 'sock-2';
    const first = beginChatTurn(socketId, 'session-a');
    const second = beginChatTurn(socketId, 'session-a');

    assert.equal(first.signal.aborted, true);
    assert.equal(second.signal.aborted, false);

    endChatTurn(socketId, 'session-a');
  });

  it('endChatTurn only clears targeted session', () => {
    const socketId = 'sock-3';
    const ctrlA = beginChatTurn(socketId, 'session-a');
    const ctrlB = beginChatTurn(socketId, 'session-b');

    endChatTurn(socketId, 'session-a');
    assert.equal(ctrlA.signal.aborted, false);
    assert.equal(ctrlB.signal.aborted, false);

    endChatTurn(socketId, 'session-b');
  });

  it('migrates pending key to real session without aborting', () => {
    const socketId = 'sock-4';
    const ctrl = beginChatTurn(socketId, undefined);
    setChatTurnSession(socketId, 'new-session');

    assert.equal(ctrl.signal.aborted, false);
    endChatTurn(socketId, 'new-session');
  });

  it('uses pending key when sessionId omitted', () => {
    const socketId = 'sock-5';
    beginChatTurn(socketId, undefined);
    endChatTurn(socketId, PENDING_CHAT_SESSION_KEY);
  });
});
