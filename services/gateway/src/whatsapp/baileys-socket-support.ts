import NodeCache from '@cacheable/node-cache';
import pino from 'pino';
import { shouldIgnoreWhatsAppJid } from './jid-policy';

type MsgRetryCounterCache = {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  del(key: string): void;
  flushAll(): void;
};

const MSG_RETRY_COUNTER_TTL_SEC = 60 * 60;

export function createBaileysLogger(): pino.Logger {
  return pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? 'warn' });
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
