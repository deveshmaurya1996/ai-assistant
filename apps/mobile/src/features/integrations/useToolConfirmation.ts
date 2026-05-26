import { useCallback, useEffect, useState } from 'react';
import type { AssistantSocket } from '@ai-assistant/sdk';
import type { ActionConfirmRequiredPayload } from '@ai-assistant/types';
import { apiClient } from '@/lib/api-client';

export function useToolConfirmation(socket: AssistantSocket | null) {
  const [pending, setPending] = useState<ActionConfirmRequiredPayload | null>(null);

  useEffect(() => {
    if (!socket) return;

    const onConfirmRequired = (payload: ActionConfirmRequiredPayload) => {
      setPending(payload);
    };

    socket.on('chat:action_confirm_required', onConfirmRequired);
    return () => {
      socket.off('chat:action_confirm_required', onConfirmRequired);
    };
  }, [socket]);

  const confirm = useCallback(async () => {
    if (!pending) return;
    await apiClient.executeTool({
      tool: pending.tool,
      args: pending.args,
      confirmed: true,
    });
    setPending(null);
  }, [pending]);

  const cancel = useCallback(() => {
    if (pending?.executionId) {
      void apiClient.cancelToolExecution(pending.executionId);
    }
    setPending(null);
  }, [pending]);

  return { pending, confirm, cancel };
}
