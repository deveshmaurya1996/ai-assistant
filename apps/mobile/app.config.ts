import type { ExpoConfig } from 'expo/config';

const EAS_PROJECT_ID = 'e571137a-6ce6-4d5f-bba1-ee812975eb4a';
const APP_VERSION = '1.0.0';

const config: ExpoConfig = {
  name: 'AI Assistant',
  slug: 'ai-assistant',
  version: APP_VERSION,
  scheme: 'ai-assistant',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  runtimeVersion: APP_VERSION,
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    enabled: true,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.aiassistant.app',
    buildNumber: '1',
    infoPlist: {
      UIBackgroundModes: ['audio', 'remote-notification'],
      NSMicrophoneUsageDescription:
        'AI Assistant needs microphone access for voice commands and transcription.',
    },
  },
  android: {
    package: 'com.aiassistant.app',
    googleServicesFile: './google-services.json',
    versionCode: 1,
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
    [
      'expo-notifications',
      {
        icon: './assets/images/splash-icon.png',
        color: '#4F46E5',
        defaultChannel: 'reminders',
        sounds: [],
      },
    ],
    'expo-image',
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
      projectId: EAS_PROJECT_ID,
    },
  },
};

export default config;
