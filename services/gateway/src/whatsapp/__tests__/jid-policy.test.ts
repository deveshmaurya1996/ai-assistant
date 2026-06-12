import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isActionableWhatsAppJid, shouldIgnoreWhatsAppJid } from '../jid-policy.js';

describe('shouldIgnoreWhatsAppJid', () => {
  it('ignores status and broadcast channels', () => {
    assert.equal(shouldIgnoreWhatsAppJid('status@broadcast'), true);
    assert.equal(shouldIgnoreWhatsAppJid('123@broadcast'), true);
  });

  it('ignores newsletters and Meta AI', () => {
    assert.equal(shouldIgnoreWhatsAppJid('team@newsletter'), true);
    assert.equal(shouldIgnoreWhatsAppJid('13135550002@c.us'), true);
  });

  it('allows direct chats and groups', () => {
    assert.equal(shouldIgnoreWhatsAppJid('919696693168@s.whatsapp.net'), false);
    assert.equal(shouldIgnoreWhatsAppJid('120363123456789012@g.us'), false);
    assert.equal(shouldIgnoreWhatsAppJid('919696693168@lid'), false);
  });

  it('treats empty jids as ignored', () => {
    assert.equal(shouldIgnoreWhatsAppJid(undefined), true);
    assert.equal(shouldIgnoreWhatsAppJid(null), true);
    assert.equal(shouldIgnoreWhatsAppJid(''), true);
  });
});

describe('isActionableWhatsAppJid', () => {
  it('is the inverse of shouldIgnoreWhatsAppJid', () => {
    assert.equal(isActionableWhatsAppJid('status@broadcast'), false);
    assert.equal(isActionableWhatsAppJid('919696693168@s.whatsapp.net'), true);
  });
});
