import { View, StyleSheet } from 'react-native';
import type { IntegrationAction } from '@ai-assistant/types';
import { IntegrationActionButton } from '@/components/integrations/IntegrationActionButton';
import { useIntegrationConnect } from '@/components/integrations/useIntegrationConnect';
import { spacing } from '@/theme/tokens';

type Props = {
  actions: IntegrationAction[];
};

export function ChatIntegrationActions({ actions }: Props) {
  const { busy, handleIntegrationAction } = useIntegrationConnect();

  if (!actions.length) return null;

  return (
    <View style={styles.row}>
      {actions.map((action) => {
        const isBusy = busy?.providerId === action.providerId;
        return (
          <IntegrationActionButton
            key={`${action.providerId}-${action.action}`}
            variant="connect"
            label={action.label}
            loading={isBusy}
            disabled={Boolean(busy)}
            onPress={() => void handleIntegrationAction(action.providerId, action.action)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
});
