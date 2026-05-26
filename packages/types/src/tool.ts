export type ToolSource = 'chat' | 'voice' | 'automation' | 'workflow' | 'manual';

export type ToolExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ConnectionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'ERROR'
  | 'DISCONNECTED';

export type Capability = 'search' | 'read' | 'write' | 'schedule';

export type ConnectChallengeType = 'oauth' | 'qr' | 'local';
