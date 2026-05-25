const {
  withAndroidManifest,
  AndroidConfig,
} = require('@expo/config-plugins');

const VOICE_SERVICE =
  'expo.modules.assistantoverlay.VoiceAssistantForegroundService';

const STALE_SERVICE_NAMES = new Set([
  '.overlay.OverlayBubbleService',
  'com.aiassistant.app.overlay.OverlayBubbleService',
  'expo.modules.assistantoverlay.OverlayBubbleService',
]);

function addOverlayService(androidManifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  if (!app.service) {
    app.service = [];
  }

  app.service = app.service.filter(
    (s) => !STALE_SERVICE_NAMES.has(s.$?.['android:name'])
  );

  const exists = app.service.some((s) => s.$?.['android:name'] === VOICE_SERVICE);
  if (!exists) {
    app.service.push({
      $: {
        'android:name': VOICE_SERVICE,
        'android:exported': 'false',
        'android:foregroundServiceType': 'microphone',
      },
    });
  }
  return androidManifest;
}

module.exports = function withAssistantOverlay(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = addOverlayService(config.modResults);
    return config;
  });
};
