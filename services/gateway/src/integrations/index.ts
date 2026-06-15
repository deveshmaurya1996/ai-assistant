export {
  PROVIDER_DEFS,
  PROVIDER_IDS,
  getProviderDef,
  type IntegrationProviderDef,
  type ProviderAuthType,
} from './provider-defs';
export type {
  ConnectionHealthResult,
  ConnectionRef,
  HealthContext,
  GatewayExecContext,
  ToolExecutionOutcome,
} from './types';
export { assessProviderHealth, registerHealthAdapter } from './health-registry';
export { executeGatewayTool, findGatewayExecAdapter, registerGatewayExecAdapter } from './exec-registry';
export { registerIntegrationAdapters } from './register';
export { executeWhatsAppDirect } from './adapters/whatsapp-exec.adapter';
