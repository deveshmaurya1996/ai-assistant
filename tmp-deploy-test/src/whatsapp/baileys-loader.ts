
export interface BaileysSocket {
  authState: { creds: { registered?: boolean | null; me?: { id?: string } | null } };
  waitForSocketOpen: () => Promise<void>;
  requestPairingCode: (phone: string) => Promise<string>;
  sendMessage: (
    jid: string,
    content: { text: string }
  ) => Promise<{ key?: { id?: string } } | undefined>;
  onWhatsApp: (jid: string) => Promise<Array<{ exists?: boolean; jid?: string }> | undefined>;
  fetchMessageHistory?: (
    count: number,
    oldestMsgKey: unknown,
    oldestMsgTimestamp: number
  ) => Promise<unknown>;
  end: (err?: Error) => void;
  ev: {
    on: (event: string, listener: (...args: any[]) => void) => void;
    off: (event: string, listener: (...args: any[]) => void) => void;
  };
}

export interface BaileysModule {
  default: (opts: Record<string, unknown>) => BaileysSocket;
  Browsers: { macOS: (browser: string) => unknown };
  DisconnectReason: { loggedOut: number; restartRequired: number };
  fetchLatestBaileysVersion: () => Promise<{ version: unknown }>;
  jidNormalizedUser: (jid: string) => string;
  makeCacheableSignalKeyStore: (keys: unknown, logger: unknown) => unknown;
  useMultiFileAuthState: (dir: string) => Promise<{
    state: { creds: unknown; keys: unknown };
    saveCreds: () => Promise<void>;
  }>;
}

let cached: BaileysModule | null = null;

export async function getBaileys(): Promise<BaileysModule> {
  if (!cached) {
    cached = (await import('@whiskeysockets/baileys')) as unknown as BaileysModule;
  }
  return cached;
}
