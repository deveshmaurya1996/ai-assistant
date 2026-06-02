# Android Overlay Module

Requires an Expo development build (`npx expo prebuild` + `pnpm mobile:android`).

## Current architecture (JS)

Overlay sync is global and mounted in:

- `src/features/voice-assistant/VoiceSessionHost.tsx`
  - wraps app with `AudioRecorderProvider`
  - mounts `AppChatSocketHost`
  - mounts `VoiceSessionProvider`
  - mounts `AssistantOverlaySyncHost` (runs `useAssistantOverlaySync`)

Core overlay files:

- `src/features/overlay/useAssistantOverlaySync.ts`
  - resolves foreground route (`chat` | `voice` | `other`)
  - builds active overlay activities from chat stream + voice session
  - rotates across multiple active activities every 5s
  - listens for app state changes and native dismiss events
  - calls `syncAssistantOverlay(...)` on every relevant state change
- `src/features/overlay/buildOverlayActivities.ts`
  - creates normalized `OverlayActivity` entries
  - maps voice phases to bubble states (`listening`/`processing`/`speaking`)
  - applies visibility policy with `shouldShowOverlay(...)`
- `src/features/overlay/resolveOverlayRoute.ts`
  - infers foreground screen from router segments
  - derives current chat session key for chat-route filtering
- `src/features/overlay/overlaySessionStore.ts`
  - stores per-session titles and dismissal state (`userDismissed`)
  - provides context labels shown in overlay subtitle
- `src/lib/overlay.ts`
  - Android native bridge + permission helpers
  - public API for show/hide/update/state/service controls

## Visibility rules (actual behavior)

`shouldShowOverlay(...)` in `buildOverlayActivities.ts` controls visibility:

- Hide when there is no `activeItem` or user dismissed overlay.
- Background app (`appState !== 'active'`): show whenever there is an active overlay item.
- Foreground voice item:
  - show on voice screen, or
  - show anywhere if overlay is enabled in settings.
- Foreground chat item on chat screen:
  - must be generating,
  - if chat route has a current session, only that session can show,
  - overlay setting must be enabled.
- Foreground non-chat screens:
  - overlay shows only if overlay setting is enabled.

## Activity priority and rotation

- Voice activity is included for active phases:
  - `listening`, `transcribing`, `waiting_for_ai`, `speaking`
- Chat activities include currently generating chat sessions only.
- Items are sorted with generating items first, then by most recent update.
- If more than one activity is visible, the overlay rotates every ~5 seconds with `N of M` hint.

## Overlay size + content sync

`syncAssistantOverlay(...)` behavior:

- Sets assistant title + context label (includes rotation hint when rotating).
- Shows overlay panel and sets bubble state.
- If text exists:
  - updates text
  - sets size tier to `medium`
- If text is empty:
  - sets size tier to `compact`

## Settings and permission flow

- User toggle lives in:
  - `src/app/(app)/(main)/settings.tsx`
  - `src/components/layout/DrawerContent.tsx`
- Persistent setting:
  - `overlayEnabled` in `src/stores/settings.ts`
- Permission helpers:
  - `canDrawOverlays()`
  - `requestOverlayPermission()`
- Toggle API:
  - `toggleOverlay(enabled)` in `src/lib/overlay.ts`

## Native bridge surface (`src/lib/overlay.ts`)

- `syncAssistantOverlay(...)`
- `subscribeOverlayDismissed(...)`
- `showOverlayPanel(text)` / `hideOverlayPanel()`
- `updateOverlayPanelText(text)`
- `setBubbleState(state)` (`idle` | `listening` | `processing` | `speaking`)
- `setOverlayAssistantName(name)`
- `setOverlayContextLabel(label)`
- `setOverlaySizeTier('compact' | 'medium')`
- `startVoiceAssistantService()` / `stopVoiceAssistantService()`
- `canDrawOverlays()` / `requestOverlayPermission()`

## Native components (Kotlin)

- `AssistantOverlayModule` - Expo module (`AssistantOverlay`) and `onOverlayDismissed` event
- `AssistantOverlayView` - draggable/resizable overlay card UI
- `OverlayWindowManager` - overlay window lifecycle + persisted layout
- `VoiceAssistantForegroundService` - foreground service for voice session continuity

## Rebuild after native changes

```bash
npx expo prebuild --clean
pnpm mobile:android
```
