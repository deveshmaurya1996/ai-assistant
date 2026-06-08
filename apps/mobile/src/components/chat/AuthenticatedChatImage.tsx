import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { Image, type ImageContentFit, type ImageLoadEventData } from 'expo-image';
import {
  authenticatedFileHeaders,
  cacheAuthenticatedFile,
} from '@/lib/authenticated-file';
import { useAttachmentPreviewStore } from '@/features/chat/attachmentPreviewStore';
import {
  openChatFileImagePreview,
  openChatLocalImagePreview,
  previewHeadersForUri,
  useImagePreviewStore,
} from '@/features/chat/imagePreviewStore';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  fileId: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  previewable?: boolean;
  filename?: string;
  onLoad?: (event: ImageLoadEventData) => void;
};

export function AuthenticatedChatImage({
  fileId,
  style,
  contentFit = 'cover',
  previewable = true,
  filename,
  onLoad,
}: Props) {
  const { colors } = useTheme();
  const localPreview = useAttachmentPreviewStore((s) => s.byFileId[fileId]);
  const [uri, setUri] = useState<string | null>(localPreview ?? null);
  const [failed, setFailed] = useState(false);
  const imageStyle = useMemo(() => StyleSheet.flatten(style) ?? {}, [style]);

  useEffect(() => {
    if (localPreview) {
      setUri(localPreview);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setUri(null);
    setFailed(false);

    void cacheAuthenticatedFile(fileId)
      .then((cached) => {
        if (!cancelled) setUri(cached);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [fileId, localPreview]);

  const openPreview = useCallback(() => {
    if (!previewable) return;
    if (localPreview) {
      openChatLocalImagePreview(localPreview, filename);
      return;
    }
    if (uri) {
      useImagePreviewStore.getState().open([
        { uri, headers: previewHeadersForUri(uri), filename },
      ]);
      return;
    }
    void openChatFileImagePreview(fileId);
  }, [fileId, filename, localPreview, previewable, uri]);

  const source = useMemo(() => {
    if (!uri) return null;
    if (
      uri.startsWith('blob:') ||
      uri.startsWith('data:') ||
      uri.startsWith('http') ||
      uri.startsWith('file:')
    ) {
      return { uri };
    }
    const headers = authenticatedFileHeaders();
    return headers ? { uri, headers } : { uri };
  }, [uri]);

  if (failed || !uri || !source) {
    return (
      <View
        style={[
          imageStyle,
          styles.placeholder,
          { backgroundColor: colors.surfaceElevated },
        ]}>
        {!failed ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      </View>
    );
  }

  const image = (
    <Image
      source={source}
      style={imageStyle}
      contentFit={contentFit}
      onLoad={onLoad}
      onError={() => {
        if (localPreview) {
          void cacheAuthenticatedFile(fileId)
            .then(setUri)
            .catch(() => setFailed(true));
          return;
        }
        setFailed(true);
      }}
    />
  );

  if (!previewable) {
    return image;
  }

  return (
    <Pressable
      onPress={openPreview}
      style={imageStyle}
      accessibilityRole="imagebutton"
      accessibilityLabel="View image full screen">
      {image}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
