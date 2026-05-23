const {
  withAndroidManifest,
  AndroidConfig,
} = require('@expo/config-plugins');

function addOverlayService(androidManifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  if (!app.service) {
    app.service = [];
  }
  const exists = app.service.some(
    (s) => s.$?.['android:name'] === '.overlay.OverlayBubbleService'
  );
  if (!exists) {
    app.service.push({
      $: {
        'android:name': '.overlay.OverlayBubbleService',
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
