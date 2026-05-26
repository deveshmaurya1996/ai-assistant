import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import type { ActionConfirmRequiredPayload } from '@ai-assistant/types';

interface Props {
  visible: boolean;
  payload: ActionConfirmRequiredPayload | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function confirmCopy(payload: ActionConfirmRequiredPayload): {
  title: string;
  subtitle: string;
  preview?: string;
} {
  if (payload.tool === 'notes.create') {
    const content =
      typeof payload.args.content === 'string'
        ? payload.args.content
        : typeof payload.args.text === 'string'
          ? payload.args.text
          : '';
    const title =
      typeof payload.args.title === 'string' && payload.args.title.trim()
        ? payload.args.title.trim()
        : 'Save note';
    return {
      title: 'Save note?',
      subtitle: title,
      preview: content || undefined,
    };
  }

  if (payload.tool.startsWith('whatsapp.')) {
    return {
      title: 'Confirm WhatsApp message',
      subtitle: payload.tool.replace('whatsapp.', '').replace(/_/g, ' '),
      preview: JSON.stringify(payload.args, null, 2),
    };
  }

  return {
    title: 'Confirm action',
    subtitle: payload.tool,
    preview: JSON.stringify(payload.args, null, 2),
  };
}

export function ActionConfirmSheet({ visible, payload, onConfirm, onCancel }: Props) {
  if (!payload) return null;

  const copy = confirmCopy(payload);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
          {copy.preview ? (
            <ScrollView style={styles.previewScroll} nestedScrollEnabled>
              <Text style={styles.preview}>{copy.preview}</Text>
            </ScrollView>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.cancel]} onPress={onCancel}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.confirm]} onPress={onConfirm}>
              <Text style={styles.buttonText}>
                {payload.tool === 'notes.create' ? 'Save' : 'Confirm'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    maxHeight: '70%',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#3b82f6', marginBottom: 8 },
  previewScroll: { maxHeight: 200, marginBottom: 16 },
  preview: { fontSize: 14, color: '#ccc', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center' },
  cancel: { backgroundColor: '#333' },
  confirm: { backgroundColor: '#3b82f6' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
