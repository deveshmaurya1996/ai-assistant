import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
  type FlashMode,
} from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlipHorizontal, X, Zap, ZapOff } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/motion/PressableScale';
import { spacing, radii } from '@/theme/tokens';

export type ChatCameraCapture = {
  uri: string;
  filename: string;
  mimeType: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onCapture: (capture: ChatCameraCapture) => void;
};

const FLASH_CYCLE: FlashMode[] = ['off', 'on', 'auto'];

function flashLabel(mode: FlashMode): string {
  if (mode === 'screen') return 'Screen';
  if (mode === 'auto') return 'Auto';
  if (mode === 'on') return 'On';
  return 'Off';
}

function normalizeFlashForFacing(mode: FlashMode, facing: CameraType): FlashMode {
  if (facing === 'front' && mode === 'on') return 'screen';
  if (facing === 'back' && mode === 'screen') return 'on';
  return mode;
}

function cycleFlash(mode: FlashMode): FlashMode {
  const base = mode === 'screen' ? 'on' : mode;
  const idx = FLASH_CYCLE.indexOf(base);
  return FLASH_CYCLE[(idx + 1) % FLASH_CYCLE.length] ?? 'off';
}

export function ChatCameraModal({ visible, onClose, onCapture }: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<ComponentRef<typeof CameraView>>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const activeFlash = normalizeFlashForFacing(flash, facing);

  const toggleFacing = useCallback(() => {
    setFacing((current) => {
      const next = current === 'back' ? 'front' : 'back';
      setFlash((prev) => normalizeFlashForFacing(prev, next));
      return next;
    });
    setIsReady(false);
  }, []);

  const toggleFlash = useCallback(() => {
    setFlash((prev) => cycleFlash(prev));
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || !isReady || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) return;
      const ext = photo.format === 'png' ? 'png' : 'jpg';
      onCapture({
        uri: photo.uri,
        filename: `photo-${Date.now()}.${ext}`,
        mimeType: ext === 'png' ? 'image/png' : 'image/jpeg',
      });
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, isReady, onCapture]);

  const requestAccess = useCallback(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    if (!visible) {
      setIsReady(false);
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  if (!visible) return null;

  const showPermissionGate = !permission?.granted;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <View style={styles.root}>
        {showPermissionGate ? (
          <View style={styles.permission}>
            <Text variant="body" style={styles.permissionText}>
              Camera access is required to take photos.
            </Text>
            <PressableScale onPress={requestAccess} style={styles.permissionBtn}>
              <Text variant="bodyMedium" style={styles.permissionBtnText}>
                Allow camera
              </Text>
            </PressableScale>
            <Pressable onPress={onClose} style={styles.permissionCancel}>
              <Text variant="caption" style={styles.permissionCancelText}>
                Cancel
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              flash={activeFlash}
              mode="picture"
              onCameraReady={() => setIsReady(true)}
            />

            <View
              style={[
                styles.topBar,
                { paddingTop: insets.top + spacing.sm },
              ]}>
              <PressableScale onPress={onClose} style={styles.iconButton}>
                <X color="#fff" size={24} />
              </PressableScale>

              <PressableScale onPress={toggleFlash} style={styles.iconButton}>
                {activeFlash === 'off' ? (
                  <ZapOff color="#fff" size={24} />
                ) : (
                  <Zap color="#fff" size={24} fill="#fff" />
                )}
                <Text variant="caption" style={styles.flashLabel}>
                  {flashLabel(activeFlash)}
                </Text>
              </PressableScale>
            </View>

            <View
              style={[
                styles.bottomBar,
                { paddingBottom: insets.bottom + spacing.lg },
              ]}>
              <View style={styles.bottomSide} />

              <PressableScale
                onPress={() => void handleCapture()}
                disabled={!isReady || isCapturing}
                style={[
                  styles.shutter,
                  (!isReady || isCapturing) && styles.shutterDisabled,
                ]}>
                {isCapturing ? (
                  <ActivityIndicator color="#111" />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </PressableScale>

              <View style={styles.bottomSide}>
                <PressableScale onPress={toggleFacing} style={styles.iconButton}>
                  <FlipHorizontal color="#fff" size={26} />
                </PressableScale>
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  permissionText: {
    color: '#fff',
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  permissionBtnText: {
    color: '#111',
  },
  permissionCancel: {
    padding: spacing.sm,
  },
  permissionCancelText: {
    color: 'rgba(255,255,255,0.7)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    zIndex: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    zIndex: 2,
  },
  bottomSide: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashLabel: {
    position: 'absolute',
    bottom: 2,
    color: '#fff',
    fontSize: 9,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
});
