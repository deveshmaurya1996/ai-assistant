import NodeCache from '@cacheable/node-cache';
import pino from 'pino';
import type { Logger } from 'pino';
import { isBenignBaileysDecryptError, isBenignBaileysInitQueryError } from './baileys-log-policy';
import { shouldIgnoreWhatsAppJid } from './jid-policy';

type MsgRetryCounterCache = {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  del(key: string): void;
  flushAll(): void;
};

const MSG_RETRY_COUNTER_TTL_SEC = 60 * 60;

function parsePinoArgs(
  args: [unknown, ...unknown[]]
): { context: Record<string, unknown>; message?: string } {
  if (typeof args[0] === 'string') {
    return { context: {}, message: args[0] };
  }
  const context = (args[0] ?? {}) as Record<string, unknown>;
  const message = typeof args[1] === 'string' ? args[1] : undefined;
  return { context, message };
}

export function createBaileysLogger(): Logger {
  return pino({
    level: process.env.WHATSAPP_LOG_LEVEL ?? 'warn',
    hooks: {
      logMethod(args, method, level) {
        const { context, message } = parsePinoArgs(args as [unknown, ...unknown[]]);
        if (
          level === 50 &&
          isBenignBaileysDecryptError(
            context as { key?: { remoteJid?: string | null; fromMe?: boolean | null }; err?: { type?: string; name?: string; message?: string } },
            message
          )
        ) {
          return this.debug(context, message ?? 'benign decrypt skip');
        }
        if (
          level === 50 &&
          isBenignBaileysInitQueryError(
            context.err as { message?: string; output?: { statusCode?: number }; statusCode?: number },
            message
          )
        ) {
          return this.warn(context, message ?? 'init queries timed out (non-fatal)');
        }
        return method.apply(this, args);
      },
    },
  });
}

export function createMsgRetryCounterCache(): MsgRetryCounterCache {
  const cache = new NodeCache({
    stdTTL: MSG_RETRY_COUNTER_TTL_SEC,
    useClones: false,
  });
  return {
    get<T>(key: string): T | undefined {
      return cache.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      cache.set(key, value);
    },
    del(key: string): void {
      cache.del(key);
    },
    flushAll(): void {
      cache.flushAll();
    },
  };
}

export function createShouldIgnoreJid(): (jid: string) => boolean {
  return (jid) => shouldIgnoreWhatsAppJid(jid);
}
