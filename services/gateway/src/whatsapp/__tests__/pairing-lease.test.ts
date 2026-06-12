import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WHATSAPP_PAIRING_CODE_TTL_MS } from '@ai-assistant/types';
import {
  clearPairingLease,
  expirePairingLeaseIfNeeded,
  isPairingCodeExpired,
  isPairingLeaseActive,
  isPairingLeaseExpired,
  issuePairingLease,
  remainingPairingMs,
  type PairingLeaseFields,
} from '../pairing-lease.js';

function baseSession(): PairingLeaseFields {
  return { updatedAt: new Date().toISOString() };
}

describe('issuePairingLease', () => {
  it('sets code, phone, and 2-minute expiry', () => {
    const session = baseSession();
    const now = new Date('2026-06-11T12:00:00.000Z');
    issuePairingLease(session, { code: 'ABCD-EFGH', phone: '919696693168', now });

    assert.equal(session.pairingCode, 'ABCD-EFGH');
    assert.equal(session.pairingPhone, '919696693168');
    assert.equal(session.pairingInProgress, true);
    assert.ok(session.pairingCodeIssuedAt);
    assert.equal(
      session.pairingCodeExpiresAt,
      new Date(now.getTime() + WHATSAPP_PAIRING_CODE_TTL_MS).toISOString()
    );
    assert.equal(isPairingLeaseActive(session, now.getTime()), true);
  });
});

describe('isPairingLeaseExpired', () => {
  it('uses pairingCodeExpiresAt when issuedAt is missing', () => {
    const session = baseSession();
    session.pairingCode = 'ABCD-EFGH';
    session.pairingCodeExpiresAt = new Date('2026-06-11T12:02:00.000Z').toISOString();

    assert.equal(
      isPairingLeaseExpired(session, new Date('2026-06-11T12:01:59.000Z').getTime()),
      false
    );
    assert.equal(
      isPairingLeaseExpired(session, new Date('2026-06-11T12:02:01.000Z').getTime()),
      true
    );
  });

  it('does not treat missing issuedAt alone as expired when expiresAt is future', () => {
    const session = baseSession();
    session.pairingCode = 'ABCD-EFGH';
    session.pairingCodeExpiresAt = new Date(Date.now() + 60_000).toISOString();
    assert.equal(isPairingCodeExpired(undefined), true);
    assert.equal(isPairingLeaseExpired(session), false);
  });
});

describe('expirePairingLeaseIfNeeded', () => {
  it('clears only expired leases', () => {
    const session = baseSession();
    issuePairingLease(session, {
      code: 'ABCD-EFGH',
      phone: '919696693168',
      now: new Date('2026-06-11T12:00:00.000Z'),
    });

    assert.equal(
      expirePairingLeaseIfNeeded(session, new Date('2026-06-11T12:01:00.000Z').getTime()),
      false
    );
    assert.equal(session.pairingCode, 'ABCD-EFGH');

    assert.equal(
      expirePairingLeaseIfNeeded(session, new Date('2026-06-11T12:02:01.000Z').getTime()),
      true
    );
    assert.equal(session.pairingCode, undefined);
  });
});

describe('remainingPairingMs', () => {
  it('counts down to zero at expiry', () => {
    const session = baseSession();
    const now = new Date('2026-06-11T12:00:00.000Z');
    issuePairingLease(session, { code: 'ABCD-EFGH', phone: '919696693168', now });

    assert.equal(remainingPairingMs(session, now.getTime() + 30_000), 90_000);
    assert.equal(remainingPairingMs(session, now.getTime() + WHATSAPP_PAIRING_CODE_TTL_MS), 0);
  });
});

describe('clearPairingLease', () => {
  it('records invalidation when requested', () => {
    const session = baseSession();
    issuePairingLease(session, { code: 'ABCD-EFGH', phone: '919696693168' });
    clearPairingLease(session, true);
    assert.equal(session.pairingCode, undefined);
    assert.ok(session.pairingInvalidatedAt);
  });
});
