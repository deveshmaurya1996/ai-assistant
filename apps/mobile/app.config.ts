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
    '@siteed/audio-studio',
    [
      'expo-audio',
      {
        microphonePermission:
          'AI Assistant needs microphone access to record voice for transcription.',
        enableBackgroundRecording: false,
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
    'expo-video',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F4F5F7',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
        dark: {
          backgroundColor: '#0B0D10',
          image: './assets/images/splash-icon.png',
        },
      },
    ],
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
