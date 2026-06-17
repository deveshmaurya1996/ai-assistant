import type { LocalParticipant } from '@livekit/rtc-node';

export const ATTRIBUTE_AGENT_STATE = 'lk.agent.state';
export const ATTRIBUTE_AGENT_TRANSCRIPT = 'lk.agent.transcript';
export const ATTRIBUTE_USER_TRANSCRIPT = 'lk.agent.user_transcript';
export const ATTRIBUTE_MESSAGES_TICK = 'lk.agent.messages_tick';

export type GatewayAgentState =
  | 'initializing'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'idle';

export async function setAgentState(
  participant: LocalParticipant | undefined,
  state: GatewayAgentState
): Promise<void> {
  if (!participant) return;
  await participant.setAttributes({ [ATTRIBUTE_AGENT_STATE]: state });
}

export async function setAgentTranscript(
  participant: LocalParticipant | undefined,
  transcript: string
): Promise<void> {
  if (!participant) return;
  await participant.setAttributes({ [ATTRIBUTE_AGENT_TRANSCRIPT]: transcript });
}

export async function setUserTranscript(
  participant: LocalParticipant | undefined,
  transcript: string
): Promise<void> {
  if (!participant) return;
  await participant.setAttributes({ [ATTRIBUTE_USER_TRANSCRIPT]: transcript });
}

export async function bumpMessagesTick(
  participant: LocalParticipant | undefined
): Promise<void> {
  if (!participant) return;
  await participant.setAttributes({
    [ATTRIBUTE_MESSAGES_TICK]: String(Date.now()),
  });
}
