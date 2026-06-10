export const BLOCKED_INTEGRATION_TOOLS = new Set([
  'email.delete',
  'gmail.delete',
  'gmail.trash',
  'whatsapp.delete_message',
  'whatsapp.delete_chat',
  'messaging.delete_message',
]);

export function isBlockedIntegrationTool(tool: string): boolean {
  return BLOCKED_INTEGRATION_TOOLS.has(tool);
}
