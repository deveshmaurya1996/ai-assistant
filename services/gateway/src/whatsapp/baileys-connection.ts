
export function isTransientWhatsAppDisconnect(
  statusCode: number | undefined,
  disconnectReason: {
    timedOut: number;
    connectionClosed: number;
    restartRequired: number;
    connectionLost?: number;
  }
): boolean {
  if (statusCode == null) return true;
  return (
    statusCode === disconnectReason.timedOut ||
    statusCode === disconnectReason.connectionClosed ||
    statusCode === disconnectReason.restartRequired ||
    (disconnectReason.connectionLost != null && statusCode === disconnectReason.connectionLost)
  );
}

export function shouldSyncFullWhatsAppHistory(
  isLinking: boolean,
  historySyncComplete: boolean | undefined,
  syncedThreads: number
): boolean {
  if (isLinking || historySyncComplete) return false;   
  return syncedThreads === 0;
}

export function formatWhatsAppUserError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('408') || lower.includes('timed out') || lower.includes('timeout')) {
    return (
      'WhatsApp connection timed out while syncing or sending. ' +
      'Keep your phone online with WhatsApp open, wait a few seconds, and try again.'
    );
  }
  if (lower.includes('not synced') || lower.includes('sync')) {
    return message;
  }
  if (lower.includes('socket failed') || lower.includes('still connecting')) {
    return (
      'WhatsApp is still connecting. Wait a few seconds and try again with your phone online.'
    );
  }
  return message;
}
