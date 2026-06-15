import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWhatsAppUserError,
  isTransientWhatsAppDisconnect,
  shouldSyncFullWhatsAppHistory,
} from '../baileys-connection.js';

const REASON = {
  timedOut: 408,
  connectionClosed: 428,
  restartRequired: 515,
  connectionLost: 500,
};

describe('isTransientWhatsAppDisconnect', () => {
  it('treats 408 and connection closed as transient', () => {
    assert.equal(isTransientWhatsAppDisconnect(408, REASON), true);
    assert.equal(isTransientWhatsAppDisconnect(428, REASON), true);
    assert.equal(isTransientWhatsAppDisconnect(515, REASON), true);
  });

  it('does not treat logged out as transient', () => {
    assert.equal(isTransientWhatsAppDisconnect(401, REASON), false);
  });
});

describe('shouldSyncFullWhatsAppHistory', () => {
  it('skips full history when threads already synced', () => {
    assert.equal(shouldSyncFullWhatsAppHistory(false, false, 10), false);
  });

  it('syncs full history only on first link', () => {
    assert.equal(shouldSyncFullWhatsAppHistory(false, false, 0), true);
    assert.equal(shouldSyncFullWhatsAppHistory(true, false, 0), false);
    assert.equal(shouldSyncFullWhatsAppHistory(false, true, 0), false);
  });
});

describe('formatWhatsAppUserError', () => {
  it('maps 408 timeout to friendly message', () => {
    const msg = formatWhatsAppUserError('Baileys 408 Timed Out');
    assert.match(msg, /timed out/i);
    assert.doesNotMatch(msg, /Baileys/i);
  });
});
