import { forwardRef, useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetModal as BottomSheetModalType,
} from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { dismissBottomSheet } from '@/lib/bottom-sheet';
import { apiClient } from '@/lib/api-client';
import { formatChatMessagesForShare, shareText } from '@/lib/share';

type Props = {
  sessionId: string | null;
  title?: string;
};

export const ShareChatSheet = forwardRef<BottomSheetModalType, Props>(
  function ShareChatSheet({ sessionId, title }, ref) {
    const { colors } = useTheme();
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);

    const loadPreview = useCallback(async () => {
      if (!sessionId) return;
      setLoading(true);
      try {
        const messages = await apiClient.getMessages(sessionId);
        setPreview(formatChatMessagesForShare(messages, title));
      } catch {
        setPreview(null);
      } finally {
        setLoading(false);
      }
    }, [sessionId, title]);

    const onShare = useCallback(async () => {
      if (!sessionId) return;
      setLoading(true);
      try {
        const messages = await apiClient.getMessages(sessionId);
        const text = formatChatMessagesForShare(messages, title);
        await shareText(text, title ?? 'Chat');
        dismissBottomSheet(ref);
      } finally {
        setLoading(false);
      }
    }, [sessionId, title, ref]);

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['40%']}
        enablePanDownToClose
        onChange={(index) => {
          if (index >= 0) void loadPreview();
        }}
        backgroundStyle={{ backgroundColor: colors.surface }}>
        <BottomSheetView style={styles.content}>
          <Text variant="h2">Share chat</Text>
          <Text variant="caption" muted style={styles.subtitle}>
            Export this conversation as text through your device share sheet.
          </Text>
          {loading && !preview ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <View style={[styles.preview, { backgroundColor: colors.surfaceElevated }]}>
              <Text variant="body" muted numberOfLines={8}>
                {preview?.trim() || 'No messages to share yet.'}
              </Text>
            </View>
          )}
          <Button
            label={loading ? 'Preparing…' : 'Share chat'}
            onPress={() => void onShare()}
            loading={loading}
            disabled={!sessionId}
            style={styles.button}
          />
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing.sm,
  },
  preview: {
    borderRadius: 12,
    padding: spacing.md,
    minHeight: 120,
  },
  loader: {
    marginVertical: spacing.xl,
  },
  button: {
    marginTop: spacing.md,
  },
});
