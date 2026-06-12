import type { WhatsAppSessionStatus } from '@ai-assistant/types';
import {
  isPairingLeaseActive,
  isPairingLeaseExpired,
  remainingPairingMs,
  type PairingLeaseFields,
} from './pairing-lease';

export function formatPairingCodeDisplay(code: string): string {
  const raw = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  }
  return code;
}

export function formatPairingCodeRaw(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

type PublicSessionInput = PairingLeaseFields & {
  status: string;
  qrData?: string;
  pairingAccepted?: boolean;
  updatedAt: string;
};

export function toPublicWhatsAppSession(
  session: PublicSessionInput,
  options?: { connectionPhase?: string; pairingReconnecting?: boolean }
): WhatsAppSessionStatus & { pairingRemainingMs?: number } {
  const leaseActive = isPairingLeaseActive(session);
  const expired = !!session.pairingCode && isPairingLeaseExpired(session);
  const showCode = leaseActive;

  const rawCode = showCode && session.pairingCode ? formatPairingCodeRaw(session.pairingCode) : '';
  const pairingCodeDisplay =
    rawCode.length === 8
      ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`
      : showCode && session.pairingCode
        ? formatPairingCodeDisplay(session.pairingCode)
        : undefined;

  return {
    status: session.status as WhatsAppSessionStatus['status'],
    qrData: session.qrData,
    pairingCode: pairingCodeDisplay,
    pairingCodeRaw: rawCode || undefined,
    pairingPhone: showCode ? session.pairingPhone : undefined,
    pairingCodeIssuedAt: showCode ? session.pairingCodeIssuedAt : undefined,
    pairingCodeExpiresAt: showCode ? session.pairingCodeExpiresAt : undefined,
    pairingRemainingMs: showCode ? remainingPairingMs(session) : undefined,
    pairingExpired: expired,
    pairingInvalidated: !!(session.pairingInvalidatedAt && !showCode),
    pairingReconnecting: options?.pairingReconnecting,
    pairingAccepted: !!session.pairingAccepted,
    connectionPhase: options?.connectionPhase,
    updatedAt: session.updatedAt,
  };
}
