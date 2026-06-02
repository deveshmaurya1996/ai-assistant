import type { ToolAdapter } from './types';
import { gmailAdapter } from './gmail.adapter';
import { whatsAppAdapter } from './whatsapp.adapter';

const adapters = new Map<string, ToolAdapter>([
  ['whatsapp', whatsAppAdapter],
  ['google', gmailAdapter],
]);

export function getToolAdapter(providerId: string): ToolAdapter | undefined {
  return adapters.get(providerId);
}

export function registerToolAdapter(adapter: ToolAdapter): void {
  adapters.set(adapter.providerId, adapter);
}
