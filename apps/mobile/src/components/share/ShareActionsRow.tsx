import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Bookmark, Check, Copy, Download, Share2 } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';

const ICON_SIZE = 13;
const BTN_SIZE = 26;

type CopyAction = {
  text: string;
};

type SaveAction = {
  onPress: () => void | Promise<void>;
  isSaved?: boolean;
};

type AsyncAction = {
  onPress: () => void | Promise<void>;
};

type Props = {
  align?: 'left' | 'right';
  copy?: CopyAction;
  save?: SaveAction;
  download?: AsyncAction;
  share?: AsyncAction;
};

export function ShareActionsRow({
  align = 'left',
  copy,
  save,
  download,
  share,
}: Props) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const [busyKey, setBusyKey] = useState<'save' | 'download' | 'share' | null>(null);

  const runAsync = async (key: 'save' | 'download' | 'share', action: () => void | Promise<void>) => {
    if (busyKey) return;
    setBusyKey(key);
    try {
      await action();
    } catch (e) {
      Alert.alert('Action failed', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleCopy = async () => {
    if (!copy?.text.trim()) return;
    await Clipboard.setStringAsync(copy.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasActions = copy || save || download || share;
  if (!hasActions) return null;

  return (
    <View style={[styles.row, align === 'right' && styles.rowRight]}>
      {copy ? (
        <Pressable
          onPress={() => void handleCopy()}
          style={[styles.btn, { backgroundColor: colors.surfaceElevated }]}
          accessibilityLabel="Copy"
          hitSlop={4}>
          {copied ? (
            <Check color={colors.success} size={ICON_SIZE} />
          ) : (
            <Copy color={colors.textMuted} size={ICON_SIZE} />
          )}
        </Pressable>
      ) : null}
      {save ? (
        <Pressable
          onPress={() => void runAsync('save', save.onPress)}
          disabled={busyKey === 'save'}
          style={[styles.btn, { backgroundColor: colors.surfaceElevated }]}
          accessibilityLabel={save.isSaved ? 'Remove from notes' : 'Save to notes'}
          hitSlop={4}>
          {busyKey === 'save' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Bookmark
              color={save.isSaved ? colors.primary : colors.textMuted}
              fill={save.isSaved ? colors.primary : 'transparent'}
              size={ICON_SIZE}
            />
          )}
        </Pressable>
      ) : null}
      {download ? (
        <Pressable
          onPress={() => void runAsync('download', download.onPress)}
          disabled={busyKey === 'download'}
          style={[styles.btn, { backgroundColor: colors.surfaceElevated }]}
          accessibilityLabel="Download image"
          hitSlop={4}>
          {busyKey === 'download' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Download color={colors.textMuted} size={ICON_SIZE} />
          )}
        </Pressable>
      ) : null}
      {share ? (
        <Pressable
          onPress={() => void runAsync('share', share.onPress)}
          disabled={busyKey === 'share'}
          style={[styles.btn, { backgroundColor: colors.surfaceElevated }]}
          accessibilityLabel="Share"
          hitSlop={4}>
          {busyKey === 'share' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Share2 color={colors.textMuted} size={ICON_SIZE} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    marginLeft: spacing.xs,
  },
  rowRight: {
    alignSelf: 'flex-end',
    marginLeft: 0,
    marginRight: spacing.xs,
  },
  btn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
