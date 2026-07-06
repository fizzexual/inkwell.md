# Inkwell companion app (Android)

A **local-first** Android app, built the way Obsidian works: the whole Inkwell web app is
**bundled inside the APK** and runs on the device, so it opens instantly and works fully
**offline** — no black screen if the server is down. Your notes live locally; syncing to your
self-hosted **sync server** happens in the background and is configured *inside* the app
(the 📱 Device sync panel). The server address can be a LAN IP, a Tailscale address, or any
tunnel — it isn't tied to one host.

## How it works

- The app is served from a secure in-app origin (`WebViewAssetLoader`) out of `assets/`.
- Mixed content is allowed so the secure app origin can reach a plain `http://` sync server on
  your LAN / Tailscale.
- The vault + settings persist in the WebView's local storage; the sync client replicates to the
  server and auto-reconnects across sleeps / network changes.

## Prerequisites

- **JDK 17–21** on your `PATH` (`java -version`).
- The **Android SDK** (platform 34 + build-tools). Point Gradle at it with `apk/local.properties`:
  ```
  sdk.dir=C:/Users/you/AppData/Local/Android/Sdk
  ```
  (or set the `ANDROID_HOME` environment variable).

## Build a debug APK (sideloadable)

```bash
# 1. build the web app (from the repo root)
npm run build

# 2. bundle it into the Android assets (local-first; prunes the heavy ML runtime)
node apk/bundle-web.mjs

# 3. build the APK (from apk/)
cd apk
gradlew.bat assembleDebug        # Windows
./gradlew assembleDebug          # macOS / Linux
```

The APK lands at `apk/app/build/outputs/apk/debug/app-debug.apk` (a ready-made copy is also
kept at `apk/releases/inkwell-android-debug.apk`). Copy it to your phone and open it to install
(enable "install unknown apps"), or `adb install -r <path>`.

## First run

1. Open the app — it works immediately (offline, local notes).
2. On your computer, start the server: `npm run sync -- --vault "C:\path\to\vault"`. It prints an
   **address** and a **token**.
3. In the app, tap the 📱 **Device sync** button (top of the sidebar) → enter the **address** +
   **token** → **Connect**. Your phone and desktop now share one vault, live.

## A real (signed) release APK

The debug APK is signed with the auto-generated debug key — fine for personal sideloading. For a
Play Store / long-lived build, create a keystore and a `release` signing config in
`app/build.gradle`, then `gradlew.bat assembleRelease`.
