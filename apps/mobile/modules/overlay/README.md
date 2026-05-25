# Android Overlay Module

Requires Expo development build (`npx expo prebuild` + `expo run:android`).

## JS bridge (`src/lib/overlay.ts`)

| Method | Description |
|--------|-------------|
| `syncVoiceOverlay({ phase, assistantText, appState, sessionActive, assistantDisplayName })` | Background voice UI with assistant name in status |
| `showOverlayPanel(text)` | Show draggable overlay card |
| `hideOverlayPanel()` | Remove overlay |
| `setBubbleState(state)` | `idle` \| `listening` \| `processing` \| `speaking` status label |
| `setOverlayAssistantName(name)` | Prefix status lines (e.g. `Nova · Listening…`) |
| `setOverlaySizeTier('compact' \| 'medium')` | Compact pill vs capped medium panel |
| `startVoiceAssistantService()` | Foreground notification + mic service |
| `stopVoiceAssistantService()` | Stop service and hide overlay |
| `canDrawOverlays()` / `requestOverlayPermission()` | Overlay permission |

## Sizing (compact → grow)

| Phase | Size |
|-------|------|
| Listening / thinking (no reply) | **Compact** — ~160×72dp pill |
| Reply text arrives | **Auto** — fixed ~58% × 32% screen |
| Manual resize | Drag **white pill** (bottom-right) — up to ~94% × 85% |
| Saved layout | Position and manual size persist |

## Interaction

- **Drag** — touch and drag the **status/header bar** to move the overlay (position is saved).
- **Resize** — drag the **white pill** on the bottom-right to grow or shrink (not locked after auto-expand).
- **Appearance** — semi-transparent card (~50% opacity) so content behind remains visible.
- **Scroll** — long assistant replies scroll inside the card body.
- **Open app** — double-tap the header bar or card body (`REORDER_TO_FRONT` + `CLEAR_TOP`).

## Voice idle auto-stop (JS)

When a voice session is active:

- **12s** of listening with no speech → ends that listen attempt.
- **2** consecutive silent listens → ends session, stops mic, hides overlay.
- **60s** with no session activity → ends session.

## Permissions

- `SYSTEM_ALERT_WINDOW` — display over other apps
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MICROPHONE`

## Native (Kotlin)

- `AssistantOverlayModule` — Expo module `AssistantOverlay`
- `AssistantOverlayView` — scrollable card, drag, corner resize, double-tap launch
- `OverlayWindowManager` — window lifecycle + persisted layout + size tiers
- `VoiceAssistantForegroundService` — keeps session alive in background

## Rebuild after native changes

```bash
npx expo prebuild --clean
pnpm mobile:android
```
