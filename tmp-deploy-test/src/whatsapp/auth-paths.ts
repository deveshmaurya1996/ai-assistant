import path from 'node:path';

export function getGatewayRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function getWhatsAppAuthRoot(): string {
  const gatewayRoot = getGatewayRoot();
  const configured = process.env.WHATSAPP_AUTH_DIR?.trim();
  if (!configured) {
    return path.join(gatewayRoot, 'data', 'wa-auth');
  }
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(gatewayRoot, configured);
}
