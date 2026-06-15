import { resolveRecipientCandidate } from '../whatsapp/recipient-hint';

export interface PendingConfirm {
  tool: string;
  args: Record<string, unknown>;
  originalText: string;
  userId: string;
  displayTo?: string;
  expiresAt: number;
}

const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingConfirms = new Map<string, PendingConfirm>();

export function setPendingConfirm(chatSessionId: string, pending: Omit<PendingConfirm, 'expiresAt'>): void {
  pendingConfirms.set(chatSessionId, {
    ...pending,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
}

export function getPendingConfirm(chatSessionId: string): PendingConfirm | undefined {
  const pending = pendingConfirms.get(chatSessionId);
  if (!pending) return undefined;
  if (Date.now() > pending.expiresAt) {
    pendingConfirms.delete(chatSessionId);
    return undefined;
  }
  return pending;
}

export function clearPendingConfirm(chatSessionId: string): void {
  pendingConfirms.delete(chatSessionId);
}

export function usesInlineConfirm(_tool: string): boolean {
  return true;
}

export function buildConfirmText(
  tool: string,
  args: Record<string, unknown>,
  originalText?: string
): string {
  if (tool === 'whatsapp.send_message') {
    const message = String(args.message ?? '').trim();
    const displayTo =
      String(args.displayTo ?? '').trim() ||
      resolveRecipientCandidate(String(args.to ?? ''), originalText).trim() ||
      'contact';
    return `I'm about to send: "${message}" to ${displayTo}. Reply yes to send, or no to cancel.`;
  }

  if (tool === 'gmail.send' || tool === 'email.send_email') {
    const to = String(args.to ?? 'recipient');
    const subject = String(args.subject ?? '').trim();
    return `I'm about to send an email to ${to}${subject ? ` with subject "${subject}"` : ''}. Reply yes to send, or no to cancel.`;
  }

  return `Please confirm ${tool}. Reply yes to confirm, or no to cancel.`;
}

export function isConfirmReply(text: string): 'yes' | 'no' | null {
  const reply = text.trim().toLowerCase();
  if (['yes', 'y', 'confirm', 'ok', 'send'].includes(reply)) return 'yes';
  if (['no', 'n', 'cancel', 'stop'].includes(reply)) return 'no';
  return null;
}
