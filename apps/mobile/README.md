# AI Assistant Mobile

Expo React Native client with floating dock navigation, drawer sidebar, full settings, and Android voice (in-app, background, overlay bubble).

> **This app requires a development build** (`expo-dev-client`). Expo Go does not include the overlay module or background voice APIs.

### Audio stack

| Package | Role |
|---------|------|
| **@siteed/audio-studio** | Recording, live analysis (VAD/waveform data), AAC output |
| **VoiceEqualizer** (in-app) | ChatGPT/Gemini-style animated bars (Reanimated) |
| **expo-audio** `~56.0.10` | TTS playback only |

After adding or upgrading audio-studio / Skia, rebuild the dev client: `npx expo prebuild --clean` then `pnpm mobile:android`.

**Expo SDK 56:** `@siteed/audio-studio@3.2.0` needs a small Kotlin patch for `Promise.reject` (see `patches/@siteed__audio-studio@3.2.0.patch` at repo root). Remove the patch when upstream ships a fix.

---

## Prerequisites

| Tool | Notes |
|------|--------|
| **Node.js 20+** | |
| **pnpm 9+** | Root `.npmrc` uses `node-linker=hoisted` (required for Android native builds on Windows) |
| **Docker Desktop** | PostgreSQL, Redis, Qdrant |
| **Android Studio** | SDK, platform-tools, NDK, CMake (see below) |
| **Physical device or emulator** | Physical device recommended for mic, notifications, overlay |

Backend must be running before you use the app (API on **3000**, AI on **8000**). See the [root README](../../README.md).

---

## One-time setup

### 1. Monorepo install (from repo root)

```bash
pnpm env:setup          # copies .env.example → .env (root + packages)
pnpm install
pnpm docker:up
pnpm db:migrate
```

### 2. Android Studio (SDK)

1. Install [Android Studio](https://developer.android.com/studio).
2. **SDK Manager** → install:
   - **Android SDK Platform** (API 36 or latest stable)
   - **Android SDK Build-Tools** 36.x
   - **NDK (Side by side)** — e.g. 27.1.x
   - **CMake** — e.g. 3.22.1
   - **Android SDK Platform-Tools** (includes `adb`)
3. Set environment variables (Windows example):

```powershell
# System or user env — adjust username if needed
ANDROID_HOME = %LOCALAPPDATA%\Android\Sdk
ANDROID_SDK_ROOT = %LOCALAPPDATA%\Android\Sdk
```

Add to PATH: `%LOCALAPPDATA%\Android\Sdk\platform-tools`

### 3. Mobile environment

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Dev API URL (all targets):

```env
EXPO_PUBLIC_API_URL=http://localhost:3000
```

On **Android** (emulator or physical device), forward ports once so `localhost` on the device reaches your PC:

```powershell
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
```

Web and iOS simulator use `localhost` without `adb reverse`.

### 4. Enable USB / wireless debugging (physical device)

**USB**

1. **Settings → About phone** → tap **Build number** 7×.
2. **Settings → Developer options** → **USB debugging** ON.
3. Connect USB, allow the debugging prompt on the phone.

**Wireless (optional)**

1. **Developer options → Wireless debugging** ON.
2. **Pair device with pairing code**, then on PC:

```powershell
adb pair <ip>:<pairing-port>    # enter 6-digit code when prompted
adb connect <ip>:5555
```

Verify:

```powershell
adb devices
# Should show your device, e.g. CPH2487 device
```

### 5. First Android dev build (one time)

From the **monorepo root**:

```bash
# Generate native android/ project if missing
cd apps/mobile
npx expo prebuild --platform android

# Build dev client and install on connected device
cd ../..
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
pnpm mobile:android
```

- First build can take several minutes.
- Grant on device when asked: **microphone**, **notifications** (Android 13+), **display over other apps** (overlay).

**Rebuild native code** only when you change native deps, `app.config.ts` plugins, or `modules/overlay/`:

```bash
pnpm mobile:android
```

JS-only changes reload via Metro — no rebuild needed.

---

## Start the project (every day)

Use **four terminals** from the repo root (or combine API + AI if you prefer).

### Terminal 1 — Infrastructure

```bash
pnpm docker:up
```

### Terminal 2 — API (port 3000)

```bash
pnpm dev:api
```

Check: http://localhost:3000/health → `{"status":"ok","service":"api"}`

### Voice transcription (Pollinations)

Android records **m4a (AAC)** for STT. The **ai-runtime** server requires **ffmpeg** to convert uploads to 16 kHz mono WAV and to measure loudness (silence detection).

Install on the machine running ai-runtime: `winget install ffmpeg` (Windows) or `apt install ffmpeg` (Linux), then restart ai-runtime.

### Voice assistant (Android overlay)

**API keys (root `.env`, server-side):**

| Tier | Keys | Voice use |
|------|------|-----------|
| 1 | `OPENAI_API_KEY` and/or `GEMINI_API_KEY` | STT, chat, TTS; future Live/Realtime |
| 3 | `POLLINATIONS_API_KEY` | Fallback STT/TTS/chat only — not realtime voice |

Minimum for classic voice: **OpenAI or Pollinations** for STT+TTS, plus a chat key if not using Pollinations for text.

**Troubleshooting — voice does nothing:**

1. `pnpm dev:api` and `pnpm dev:ai` running
2. Root `.env` has at least one of `OPENAI_API_KEY`, `POLLINATIONS_API_KEY`, `GEMINI_API_KEY`
3. `apps/mobile/.env` → `EXPO_PUBLIC_API_URL=http://localhost:3000` (or your LAN IP)
4. Custom **dev build** (not Expo Go) for the overlay native module
5. **Microphone** and **Overlay** permissions granted
6. Open **Assistant** tab and tap the assistant button (Sparkles) to start

**Controls (Settings / Assistant):**

- **Assistant button (Assistant tab)** — start voice sessions; chat transcript above; waveform footer while listening
- **Keep listening** (Settings) — when on, assistant stays active and does not auto-end on silence; when off, voice chat ends after inactivity
- **Speak replies** (Settings) — off = text + overlay only (no TTS)
- **Your assistant** — custom name + personality (Female / Male / Neutral labels)
- **Floating overlay** — panel when app is in background during voice

**Overlay interaction:**

1. Grant **Display over other apps** when prompted.
2. During voice, overlay starts **compact** (`Name · Listening…`), grows with reply text (capped ~65% × 38% screen).
3. **Drag** header bar or left footer dot to move; **resize** via right footer dot; **double-tap** to open app.
4. Socket `voice:turn_*` uploads audio; HTTP `/voice/transcribe` if socket is down.
5. Optional: `VOICE_STT_PROVIDER=deepgram` + `DEEPGRAM_API_KEY` for streaming STT (AI service).
6. Phase 4: `VOICE_MODE=gemini-live` or `openai-realtime` when Live keys are configured.

Rebuild the dev client after native overlay changes:

```bash
npx expo prebuild --clean
pnpm mobile:android
```

### Terminal 3 — AI service (port 8000, optional for chat/voice)

```bash
pnpm dev:ai
```

### Terminal 4 — Metro + open on Android

**Emulator**

```bash
# Start an AVD from Android Studio Device Manager first
pnpm --filter @ai-assistant/mobile dev
# Press a in the Expo terminal to open Android
```

**Physical device** (dev client already installed)

```bash
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
pnpm --filter @ai-assistant/mobile dev
```

Then on the phone: open **AI Assistant** (dev client). It connects to Metro on port 8081.

If the bundle does not load, shake the device → **Reload**, or confirm Metro is running and `adb reverse` was applied.

**Physical device — reinstall dev client + Metro in one step**

```bash
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
pnpm mobile:android
```

This builds (if needed), installs the APK, and opens the app pointing at your machine.

---

## Google sign-in (optional)

Configured in the **root** `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

| Setting | Value |
|---------|--------|
| Redirect URI | `http://localhost:3000/api/auth/callback/google` |
| Web callback (Expo web) | `http://localhost:8081/auth/callback` (via API bridge) |
| Native deep link | `ai-assistant://auth/callback` |
| JS origins (dev) | `http://localhost:8081`, `http://localhost:3000` |

Use the **API on port 3000**, not 8000, for auth and `EXPO_PUBLIC_API_URL`.

---

## Expo Go (limited)

```bash
pnpm --filter @ai-assistant/mobile dev
```

Works for basic UI and API calls. **Does not support** assistant keep-listening in the background or the overlay bubble — use a dev build for those features.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `adb devices` empty | Re-plug USB, re-enable wireless debugging, run `adb kill-server` then `adb start-server` |
| Red screen / cannot load bundle | Start Metro (`pnpm --filter @ai-assistant/mobile dev`), run `adb reverse tcp:8081 tcp:8081` |
| API errors on device | `adb reverse tcp:3000 tcp:3000`, `EXPO_PUBLIC_API_URL=http://localhost:3000`, API running on :3000 |
| Windows `prefab_command.bat` / path too long | Ensure root `.npmrc` has `node-linker=hoisted`, then `pnpm install` from repo root |
| Gradle / NDK errors | Install NDK + CMake in SDK Manager; project uses Gradle **8.13** (see `android/gradle/wrapper/gradle-wrapper.properties`) |
| Port 8081 in use | Stop other Metro instances or use `npx expo start --dev-client --port 8083` |

---

## UI overview

| Area | Description |
|------|-------------|
| **Floating dock** | Chats · Assistant · Settings + center mic |
| **Sidebar** | Profile, new chat, assistant shortcut, theme, overlay toggle |
| **Settings** | Theme, model, voice, overlay, account |
| **Terms** | Required before registration |

## Voice assistant (Assistant tab)

Each turn uses the **backend AI stack** (not on-device speech models):

| Stage | Client | Backend |
|-------|--------|---------|
| Listen | `useVoiceTurnRecorder` (m4a + VAD) | — |
| STT | `useVoiceTurnSocket` → `voice:turn_*` | API → AI `/v1/voice/transcribe` |
| Think | `chat:message` over Socket.IO | API → AI `/v1/chat/stream` |
| Speak | `SentenceTtsQueue` → `/voice/speak` | AI `/v1/voice/speak` |

Idle auto-stop: **12s** no speech per listen, **2** silent listens, **60s** session inactivity.

For production with many users, run multiple API + AI replicas behind a load balancer (see [root README](../../README.md#voice-assistant-ai-pipeline)).

The **Assistant** tab runs a hands-free voice session (not the chat mic):

1. Tap the large **assistant button** (Sparkles) to **start** — creates a `Voice chat` session (`kind: voice`).
2. Speak naturally; chat messages appear above; a **waveform** in the dock-safe footer animates while listening.
3. Tap **End conversation** to **end** the session.
4. Open **Chats** — the session appears with a mic icon and “Spoken conversation”.
5. Open the voice chat to read the **transcript** (read-only, no composer).

### Android overlay (background)

When a voice session is active and the app is in the background, a **floating card** shows your assistant name, session state, and reply text. It starts compact and grows with content up to a capped size.

| Gesture | Action |
|---------|--------|
| Drag **header bar** or **left dot** | Move overlay anywhere (position saved) |
| Drag **right dot** (footer) | Resize card |
| **Double-tap** header or card | Open app |
| Scroll body | Read long replies |

| Requirement | Notes |
|-------------|--------|
| Dev build | `npx expo prebuild --platform android` then `pnpm mobile:android` |
| Permission | **Display over other apps** |
| Foreground service | `VoiceAssistantForegroundService` |

### Voice idle auto-stop

When **Keep listening** is **off** in Settings, the session ends automatically when nothing is happening:

- **12s** listening with no speech → ends that listen attempt
- **2** consecutive silent listens → ends session
- **60s** with no activity → ends session

When **Keep listening** is **on**, the assistant stays active until you tap **End conversation**. You can still end manually at any time.

**iOS / Web:** Voice assistant works in-app; **no system overlay** on iOS or web in v1.

### Database migration (voice session kind)

After pulling, from repo root:

```bash
pnpm db:migrate
```

## Verification checklist (Android)

1. Register after accepting terms
2. Navigate all three dock tabs
3. Open sidebar (menu icon)
4. Create chat and send message
5. **Assistant tab:** tap assistant button → speak → chat + waveform footer → End conversation → open Voice chat in list
6. **Chat mic:** tap mic → circular visualizer around button, stop in center → tap stop → transcript fills input (no auto-send)
7. Settings: change theme and preferred model
8. Voice session in background → overlay shows assistant text (grant overlay permission)
9. **Keep listening** on: assistant session stays active after long silence; foreground notification while session is active. Off: session ends after inactivity

## Voice UI architecture

Recording and live waveforms use [@siteed/audio-studio](https://www.npmjs.com/package/@siteed/audio-studio) (`AudioRecorderProvider` + `useSharedAudioRecorder` with `enableProcessing`). Visualization uses [@siteed/audio-ui](https://www.npmjs.com/package/@siteed/audio-ui) `WaveformPreview` (Skia).

| Layer | Path | Role |
|-------|------|------|
| Provider | `VoiceSessionHost` | `AudioRecorderProvider` wrapper |
| Studio config | `features/voice/studio/recordingConfig.ts` | Chat vs assistant recording presets |
| Live analysis | `features/voice/studio/useStudioVoiceAnalysis.ts` | `analysisData.dataPoints` → level + VAD |
| Capture | `features/voice/capture/useVoiceCapture.ts` | Chat record lifecycle |
| Chat dictation | `features/voice/capture/useChatDictation.ts` | Tap-to-toggle → HTTP transcribe |
| Chat mic UI | `components/voice/ChatVoiceMic.tsx` | Orb + studio waveform bars |
| Assistant start | `components/assistant/AssistantStartButton.tsx` | Sparkles button (idle) |
| Assistant footer | `components/assistant/AssistantActiveFooter.tsx` | `StudioWaveform` + End |
| Waveform | `components/voice/StudioWaveform.tsx` | Skia `WaveformPreview` |
| Playback | `lib/voice-playback.ts` | expo-audio TTS |
| Assistant session | `features/voice-assistant/*` | Hands-free loop (socket STT, chat, TTS) |

## Project structure

```
src/
  app/           Expo Router routes
  theme/         Design tokens + ThemeProvider
  components/    UI kit, layout, voice, settings
  features/      voice/ (capture, metering), voice-assistant/
  stores/        Auth + settings (Zustand)
modules/overlay/ Native Android overlay module
```
