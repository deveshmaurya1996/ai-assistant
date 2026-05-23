# Android Overlay Module

Requires Expo development build (`npx expo prebuild` + `expo run:android`).

## Permissions

- `SYSTEM_ALERT_WINDOW`
- Foreground service for overlay persistence

## Native bridge (Kotlin)

Implement in `android/` after prebuild:

- `showOverlay(text: String)`
- `hideOverlay()`
- `setOverlayDraft(text: String)`

Register as Expo module and add to `app.config.ts` plugins.
