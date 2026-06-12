import { useEffect, useState } from 'react';
import type { WhatsAppSessionStatus } from '@ai-assistant/types';
import { WHATSAPP_PAIRING_CODE_TTL_MS } from '@ai-assistant/types';

export type PairingSessionState = WhatsAppSessionStatus & { connectionId?: string };

export function isPairingExpired(session: PairingSessionState | null): boolean {
  if (!session) return false;
  if (session.pairingExpired) return true;
  if (typeof session.pairingRemainingMs === 'number') {
    return session.pairingRemainingMs <= 0;
  }
  if (session.pairingCodeExpiresAt) {
    return Date.now() >= new Date(session.pairingCodeExpiresAt).getTime();
  }
  if (session.pairingCodeIssuedAt) {
    return (
      Date.now() - new Date(session.pairingCodeIssuedAt).getTime() >=
      WHATSAPP_PAIRING_CODE_TTL_MS
    );
  }
  return false;
}

export function mergePairingSession(
  prev: PairingSessionState | null,
  data: PairingSessionState
): PairingSessionState {
  if (data.status === 'active') {
    return { ...data };
  }

  if (data.pairingCode && data.pairingCodeIssuedAt) {
    return { ...data };
  }

  const next = { ...data };
  const prevStillValid =
    !!prev?.pairingCode && !!prev.pairingCodeIssuedAt && !isPairingExpired(prev);

  const shouldPreserveCode =
    prevStillValid &&
    !next.pairingCode &&
    !next.pairingExpired &&
    !next.pairingInvalidated;

  if (shouldPreserveCode || (next.pairingReconnecting && prevStillValid)) {
    next.pairingCode = next.pairingCode ?? prev!.pairingCode;
    next.pairingPhone = next.pairingPhone ?? prev!.pairingPhone;
    next.pairingCodeIssuedAt = next.pairingCodeIssuedAt ?? prev!.pairingCodeIssuedAt;
    next.pairingCodeExpiresAt = next.pairingCodeExpiresAt ?? prev!.pairingCodeExpiresAt;
    next.pairingCodeRaw = next.pairingCodeRaw ?? prev!.pairingCodeRaw;
    next.pairingRemainingMs = next.pairingRemainingMs ?? prev!.pairingRemainingMs;
    next.pairingInvalidated = false;
  }

  return next;
}

export function usePairingCountdown(expiresAt?: string, issuedAt?: string): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const end = expiresAt
      ? new Date(expiresAt).getTime()
      : issuedAt
        ? new Date(issuedAt).getTime() + WHATSAPP_PAIRING_CODE_TTL_MS
        : null;
    if (!end) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, end - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, issuedAt]);

  return remaining;
}
