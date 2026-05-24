import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'AI Assistant',
  slug: 'ai-assistant',
  version: '1.0.0',
  scheme: 'ai-assistant',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.aiassistant.app',
    infoPlist: {
      UIBackgroundModes: ['audio'],
      NSMicrophoneUsageDescription:
        'AI Assistant needs microphone access for voice commands and transcription.',
    },
  },
  android: {
    package: 'com.aiassistant.app',
    softwareKeyboardLayoutMode: 'resize',
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WAKE_LOCK',
    ],
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    [
      'expo-audio',
      {
        microphonePermission:
          'AI Assistant needs microphone access to record voice for transcription.',
        enableBackgroundRecording: true,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
        },
      },
    ],
    './modules/overlay/app.plugin.js',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    eas: {
      projectId: 'ai-assistant-local',
    },
  },
};

export default config;
