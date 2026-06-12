import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function bindRequestId(requestId: string): void {
  storage.enterWith({ requestId });
}

export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function resolveRequestId(headerValue?: string | string[]): string {
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }
  if (Array.isArray(headerValue) && headerValue[0]?.trim()) {
    return headerValue[0].trim();
  }
  return randomUUID();
}

export function correlationHeaders(requestId?: string): Record<string, string> {
  const id = requestId ?? getRequestId();
  return id ? { 'x-request-id': id } : {};
}
