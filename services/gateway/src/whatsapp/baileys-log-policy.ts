import { shouldIgnoreWhatsAppJid } from './jid-policy';

const BENIGN_DECRYPT_ERROR_NAMES = new Set(['MessageCounterError', 'SessionError']);
const BENIGN_DECRYPT_FRAGMENTS = [
  'Key used already or never filled',
  'Bad MAC',
  'No session record',
] as const;

type DecryptLogContext = {
  key?: { remoteJid?: string | null; fromMe?: boolean | null };
  err?: { type?: string; name?: string; message?: string };
};

function errText(err: DecryptLogContext['err']): string {
  if (!err) return '';
  return [err.type, err.name, err.message].filter(Boolean).join(' ');
}

export function isBenignBaileysDecryptError(
  context: DecryptLogContext,
  message?: string
): boolean {
  if (message !== 'failed to decrypt message') return false;

  const remoteJid = context.key?.remoteJid ?? '';
  if (shouldIgnoreWhatsAppJid(remoteJid)) return true;

  const text = errText(context.err);
  const isKnownCounterOrSessionError = BENIGN_DECRYPT_ERROR_NAMES.has(context.err?.type ?? '')
    || BENIGN_DECRYPT_ERROR_NAMES.has(context.err?.name ?? '')
    || BENIGN_DECRYPT_FRAGMENTS.some((fragment) => text.includes(fragment));

  if (!isKnownCounterOrSessionError) return false;

  if (context.key?.fromMe === true) return true;

  return remoteJid.endsWith('@lid');
}
