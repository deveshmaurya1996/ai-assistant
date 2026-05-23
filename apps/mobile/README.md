# AI Assistant Mobile

Expo React Native client with floating dock navigation, drawer sidebar, full settings, and Android voice (in-app, background, overlay bubble).

> **This app requires a development build** (`expo-dev-client`). Expo Go does not include the overlay module or background voice APIs.

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

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`:

| Target | `EXPO_PUBLIC_API_URL` |
|--------|------------------------|
| **Android emulator** | `http://10.0.2.2:3000` |
| **Physical device (Wi‑Fi)** | `http://<YOUR_PC_LAN_IP>:3000` e.g. `http://192.168.1.10:3000` |

Find your PC IP: `ipconfig` (Windows) → IPv4 on your Wi‑Fi adapter. Phone and PC must be on the **same network**.

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
| Mobile deep link | `ai-assistant://auth/callback` |
| JS origins (dev) | `http://localhost:8081`, `http://localhost:3000` |

Use the **API on port 3000**, not 8000, for auth and `EXPO_PUBLIC_API_URL`.

---

## Expo Go (limited)

```bash
pnpm --filter @ai-assistant/mobile dev
```

Works for basic UI and API calls. **Does not support** background voice recording or the overlay bubble — use a dev build for those features.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `adb devices` empty | Re-plug USB, re-enable wireless debugging, run `adb kill-server` then `adb start-server` |
| Red screen / cannot load bundle | Start Metro (`pnpm --filter @ai-assistant/mobile dev`), run `adb reverse tcp:8081 tcp:8081` |
| API errors on device | Check `EXPO_PUBLIC_API_URL` (LAN IP for physical device), `adb reverse tcp:3000 tcp:3000`, API running on :3000 |
| Windows `prefab_command.bat` / path too long | Ensure root `.npmrc` has `node-linker=hoisted`, then `pnpm install` from repo root |
| Gradle / NDK errors | Install NDK + CMake in SDK Manager; project uses Gradle **8.13** (see `android/gradle/wrapper/gradle-wrapper.properties`) |
| Port 8081 in use | Stop other Metro instances or use `npx expo start --dev-client --port 8083` |

---

## UI overview

| Area | Description |
|------|-------------|
| **Floating dock** | Chats · Assistant · Settings + center mic |
| **Sidebar** | Profile, new chat, theme, overlay toggle |
| **Settings** | Theme, model, voice, overlay, RAG, account |
| **Terms** | Required before registration |

## Verification checklist (Android)

1. Register after accepting terms
2. Navigate all three dock tabs
3. Open sidebar (menu icon)
4. Create chat and send message
5. Tap dock mic → speak → transcript
6. Settings: change theme and preferred model
7. Enable overlay in Settings → bubble appears over home screen
8. Background voice: start recording, press Home, stop from notification

## Project structure

```
src/
  app/           Expo Router routes
  theme/         Design tokens + ThemeProvider
  components/    UI kit, layout, voice, settings
  features/      Voice permissions + recorder hook
  stores/        Auth + settings (Zustand)
  context/       Voice bottom sheet provider
modules/overlay/ Native Android overlay module
```
