# Inkwell companion app (Android)

A tiny native Android shell that opens your self-hosted **Inkwell sync server** in a
full-screen WebView. The server address is configurable, so it works over your LAN, a
**Tailscale** address, or any tunnel URL — it isn't tied to one host. The web app inside
keeps the live sync connection (auto-reconnects when the phone wakes or the network
changes); this shell just hosts it and reloads on resume so it re-syncs immediately.

## Prerequisites

- **JDK 17–21** on your `PATH` (`java -version`).
- The **Android SDK** (platform 34 + build-tools). Easiest via Android Studio, or the
  command-line tools. Point Gradle at it with `apk/local.properties`:
  ```
  sdk.dir=C:/Users/you/AppData/Local/Android/Sdk
  ```
  (or set the `ANDROID_HOME` environment variable).

## Build a debug APK (sideloadable)

From the `apk/` folder:

```bash
# Windows
gradlew.bat assembleDebug

# macOS / Linux
./gradlew assembleDebug
```

The APK lands at:

```
apk/app/build/outputs/apk/debug/app-debug.apk
```

Copy it to your phone and open it to install (enable "install unknown apps" for your
file manager / browser). Or install over USB with:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## First run

1. On your computer, start the server: `npm run sync -- --vault "C:\path\to\vault"`.
   It prints an **address** (LAN / Tailscale) and a **token**.
2. Open the Inkwell app on the phone → enter that **address** → Connect.
3. In Inkwell, open the 📱 **Device sync** panel (the address is pre-filled) → paste the
   **token** → Connect. Your phone and desktop now share one vault, live.

Press **Back** at the vault root for a menu (Reload / Change server / Exit).

## A real (signed) release APK

The debug APK is signed with the auto-generated debug key — fine for personal sideloading.
For a Play Store / long-lived build, create a keystore and a `release` signing config in
`app/build.gradle`, then `gradlew.bat assembleRelease`.
