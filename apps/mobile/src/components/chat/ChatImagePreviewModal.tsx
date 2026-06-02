import { useCallback, useRef } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/tokens';
import {
  toExpoImageSource,
  useImagePreviewStore,
  type ImagePreviewSource,
} from '@/features/chat/imagePreviewStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function ChatImagePreviewModal() {
  const insets = useSafeAreaInsets();
  const visible = useImagePreviewStore((s) => s.visible);
  const images = useImagePreviewStore((s) => s.images);
  const index = useImagePreviewStore((s) => s.index);
  const close = useImagePreviewStore((s) => s.close);
  const setIndex = useImagePreviewStore((s) => s.setIndex);
  const listRef = useRef<FlatList<ImagePreviewSource>>(null);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (next !== index) setIndex(next);
    },
    [index, setIndex]
  );

  const renderItem = useCallback(
    ({ item }: { item: ImagePreviewSource }) => (
      <View style={styles.page}>
        <Image
          source={toExpoImageSource(item)}
          style={styles.image}
          contentFit="contain"
          transition={200}
        />
      </View>
    ),
    []
  );

  if (!visible || images.length === 0) {
    return null;
  }

  const current = images[index];

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={close}>
      <StatusBar style="light" />
      <View style={styles.backdrop}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(item, i) => `${item.uri}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={images.length > 1 ? index : undefined}
          getItemLayout={
            images.length > 1
              ? (_, i) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * i,
                  index: i,
                })
              : undefined
          }
          onScrollToIndexFailed={() => undefined}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={renderItem}
        />

        <View
          style={[
            styles.chrome,
            { paddingTop: insets.top + spacing.sm, paddingRight: insets.right + spacing.md },
          ]}>
          <Pressable
            onPress={close}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close image preview">
            <X color="#fff" size={22} />
          </Pressable>
        </View>

        {current?.filename || images.length > 1 ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: insets.bottom + spacing.md },
            ]}>
            {current?.filename ? (
              <Text variant="caption" style={styles.footerText} numberOfLines={1}>
                {current.filename}
              </Text>
            ) : null}
            {images.length > 1 ? (
              <Text variant="caption" style={styles.footerText}>
                {index + 1} / {images.length}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  page: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  chrome: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
  },
  footerText: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
});
