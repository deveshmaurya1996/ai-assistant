import { WHATSAPP_PAIRING_CODE_TTL_MS } from '@ai-assistant/types';

export { WHATSAPP_PAIRING_CODE_TTL_MS as PAIRING_CODE_TTL_MS };

export interface PairingLeaseFields {
  pairingCode?: string;
  pairingPhone?: string;
  pairingInProgress?: boolean;
  pairingCodeIssuedAt?: string;
  pairingCodeExpiresAt?: string;
  pairingInvalidatedAt?: string;
  updatedAt: string;
}

export function pairingCodeExpiresAt(issuedAt?: string): string | undefined {
  if (!issuedAt) return undefined;
  return new Date(new Date(issuedAt).getTime() + WHATSAPP_PAIRING_CODE_TTL_MS).toISOString();
}

export function resolvePairingExpiresAt(session: PairingLeaseFields): string | undefined {
  if (session.pairingCodeExpiresAt) return session.pairingCodeExpiresAt;
  return pairingCodeExpiresAt(session.pairingCodeIssuedAt);
}

export function isPairingLeaseExpired(session: PairingLeaseFields, now = Date.now()): boolean {
  const expiresAt = resolvePairingExpiresAt(session);
  if (!expiresAt) return true;
  return now >= new Date(expiresAt).getTime();
}

/** @deprecated Use isPairingLeaseExpired — kept for existing imports */
export function isPairingCodeExpired(issuedAt?: string): boolean {
  if (!issuedAt) return true;
  return Date.now() - new Date(issuedAt).getTime() >= WHATSAPP_PAIRING_CODE_TTL_MS;
}

export function isPairingLeaseActive(session: PairingLeaseFields, now = Date.now()): boolean {
  if (!session.pairingCode) return false;
  return !isPairingLeaseExpired(session, now);
}

export function remainingPairingMs(session: PairingLeaseFields, now = Date.now()): number {
  const expiresAt = resolvePairingExpiresAt(session);
  if (!expiresAt) return 0;
  return Math.max(0, new Date(expiresAt).getTime() - now);
}

export function issuePairingLease(
  session: PairingLeaseFields,
  input: { code: string; phone: string; now?: Date }
): void {
  const now = input.now ?? new Date();
  const issuedAt = now.toISOString();
  session.pairingPhone = input.phone;
  session.pairingCode = input.code;
  session.pairingInProgress = true;
  session.pairingCodeIssuedAt = issuedAt;
  session.pairingCodeExpiresAt = new Date(
    now.getTime() + WHATSAPP_PAIRING_CODE_TTL_MS
  ).toISOString();
  session.pairingInvalidatedAt = undefined;
  session.updatedAt = issuedAt;
}

export function clearPairingLease(session: PairingLeaseFields, invalidated: boolean): void {
  const hadCode = !!session.pairingCode;
  session.pairingCode = undefined;
  session.pairingPhone = undefined;
  session.pairingInProgress = false;
  session.pairingCodeIssuedAt = undefined;
  session.pairingCodeExpiresAt = undefined;
  if (invalidated && hadCode) {
    session.pairingInvalidatedAt = new Date().toISOString();
  } else if (!invalidated) {
    session.pairingInvalidatedAt = undefined;
  }
  session.updatedAt = new Date().toISOString();
}

export function expirePairingLeaseIfNeeded(session: PairingLeaseFields, now = Date.now()): boolean {
  if (!session.pairingCode) return false;
  if (!isPairingLeaseExpired(session, now)) return false;
  clearPairingLease(session, false);
  return true;
}
