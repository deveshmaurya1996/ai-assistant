import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { issuePairingLease } from '../pairing-lease.js';
import { toPublicWhatsAppSession } from '../pairing-public.js';

describe('toPublicWhatsAppSession', () => {
  it('returns active pairing fields within lease', () => {
    const now = new Date();
    const session = {
      status: 'pending',
      updatedAt: now.toISOString(),
    };
    issuePairingLease(session, { code: 'ABCDEFGH', phone: '919696693168', now });

    const pub = toPublicWhatsAppSession(session, { pairingReconnecting: true });
    assert.equal(pub.pairingCode, 'ABCD-EFGH');
    assert.equal(pub.pairingCodeRaw, 'ABCDEFGH');
    assert.equal(pub.pairingPhone, '919696693168');
    assert.ok(pub.pairingCodeExpiresAt);
    assert.equal(pub.pairingExpired, false);
    assert.equal(pub.pairingInvalidated, false);
    assert.equal(pub.pairingReconnecting, true);
    assert.ok(typeof pub.pairingRemainingMs === 'number' && pub.pairingRemainingMs > 0);
  });

  it('hides code when lease expired', () => {
    const now = new Date();
    const session = {
      status: 'pending',
      updatedAt: now.toISOString(),
    };
    issuePairingLease(session, { code: 'ABCDEFGH', phone: '919696693168', now });

    const pub = toPublicWhatsAppSession(session, {
      connectionPhase: 'connecting',
    });
    const expiredView = toPublicWhatsAppSession(
      {
        ...session,
        pairingCodeExpiresAt: new Date(now.getTime() - 1_000).toISOString(),
      },
      {}
    );

    assert.equal(pub.pairingCode, 'ABCD-EFGH');
    assert.equal(expiredView.pairingCode, undefined);
    assert.equal(expiredView.pairingExpired, true);
  });
});
