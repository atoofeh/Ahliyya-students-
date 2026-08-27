# Android app (Capacitor) — Design

**Date:** 2026-08-27
**Status:** Approved
**Builds on:** `study-ui-v1`
**Scope:** Sub-project 7 of the hardening mission — ship the LMS as an Android application, with the security posture the browser cannot provide.

Out of scope: iOS (the plugin is written so an iOS target is additive, not a rewrite); Play Store submission; push notifications; offline course content; an in-app update channel.

---

## 1. Findings (read from the current tree)

| # | Finding | Where |
|---|---|---|
| A1 | No Android project exists. `desktop/` holds **no source** — one tracked file (`package-lock.json`, Electron) plus 276 MB of untracked `node_modules`. | `desktop/` |
| A2 | Document downloads are broken **today, on web**. Three places link with a bare `<a href>` to `${API_BASE}/files/:id/content?download=1`; that route is behind `router.use(authenticate)`, which reads `Authorization: Bearer` only, and the refresh cookie is path-scoped to `/api/v1/auth`. Every such link is a 401. | `CoursePlayer.jsx:214`, `CoursePlayer.jsx:306`, `AssignmentsTab.jsx:145`, `files.routes.js:80`, `authenticate.js:21` |
| A3 | The server already implements and tests the native auth contract: `x-client-platform: android` gets a `refreshToken` body copy, and `/auth/refresh` accepts a body token when the cookie is absent. Web must **not** receive the body copy. | `auth.controller.js:14-51`, `tests/auth.test.js:33-63` |
| A4 | `ALLOWED_ORIGINS` exists specifically for "Capacitor origins" but is empty. | `security.js:9-12`, `server/.env:46` |
| A5 | No `env(safe-area-inset-*)` anywhere in the client — status bars, notches and gesture bars will overlap the shell and the player's fixed bars. | `client/src` (zero matches) |
| A6 | `index.html` blocks first paint on a `fonts.googleapis.com` stylesheet — a network round-trip on every cold app start. | `client/index.html` |
| A7 | Toolchain present: JDK 21.0.8, cmdline-tools, platform-tools, `android-35` + build-tools `35.0.0`. Capacitor 8 needs **compileSdk 36**. | local SDK |
| A8 | The device identity the one-device policy binds is a `crypto.randomUUID()` in `localStorage`. A WebView's storage is per-install, so a reinstall would look like a new device and lock the student out. | `client/src/api/fingerprint.js` |

## 2. Decisions

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| 1 | Wrapper | Capacitor 8, living inside `client/` (`client/capacitor.config.ts`, `client/android/`). `webDir: 'dist'`, so `cap sync` consumes the existing Vite build and the repo stays two npm packages. | Trusted Web Activity (needs a public HTTPS host + Digital Asset Links, and gives no Keystore or `FLAG_SECURE` control); Cordova; a React Native rewrite |
| 2 | Native bridge | One **first-party** plugin, `LmsNative` (Java). Methods: `secureSet`, `secureGet`, `secureRemove`, `deviceId`, `openFile`. Only official `@capacitor/*` packages besides it. | `capacitor-secure-storage-plugin`, `@capacitor-community/file-opener` (third-party supply chain); `androidx.security:security-crypto` (Jetpack Security is deprecated) |
| 3 | Refresh-token storage | AndroidKeyStore AES-256-GCM. A non-exportable key is generated in the Keystore on first use; the token is stored as `base64(iv):base64(ciphertext)` in SharedPreferences and wiped on logout. The access token stays in memory, exactly as on web. | `@capacitor/preferences` (plaintext SharedPreferences); `localStorage` |
| 4 | Session transport on native | `withCredentials: false`; the refresh token travels in the request body per the contract in A3. Cookies from `https://localhost` to the API host are cross-site and unreliable in a WebView. | Relying on the cookie |
| 5 | Device identity | `deviceId` = SHA-256 of `Settings.Secure.ANDROID_ID`, hashed **inside the plugin** so the raw value never crosses the bridge or the network. Falls back to a Keystore-stored UUID when `ANDROID_ID` is null or the known-buggy `9774d56d682e549c`. Survives reinstall → a reinstall needs no admin device reset. | A fresh UUID per install |
| 6 | Screen capture | `FLAG_SECURE` on the activity: blocks screenshots, screen recording and casting of course video at the OS level. `SECURITY.md` states plainly what it does **not** stop (a camera pointed at the screen; a rooted device). | Leaving it off; a JS-only deterrent |
| 7 | Network | `usesCleartextTraffic=false` in the manifest; `network_security_config.xml` permits cleartext only for the LAN dev host, `10.0.2.2` and `localhost`, and only in the **debug** variant. No certificate pinning: with no update channel, a rotation would brick every installed app. Rationale recorded in `SECURITY.md`. | Pinning now |
| 8 | API base URL | Build-time `VITE_API_URL`. This build targets the LAN dev server, `http://192.168.1.115:5000/api/v1`, so a real phone on the same Wi-Fi reaches it. `docs/ANDROID.md` documents the one-line rebuild when a domain exists. | An in-app editable server address (a settable-endpoint surface); emulator-only loopback |
| 9 | Files | New `client/src/api/download.js`. `api.get(url, { responseType: 'blob' })`, then: web → object URL + `<a download>` + `revokeObjectURL`; native → base64 → `Filesystem.writeFile(Directory.Cache)` → `LmsNative.openFile` through a `FileProvider`. Fixes A2 for both platforms. | A second signed-URL surface for something the Bearer token already covers |
| 10 | Fonts | Self-host Plus Jakarta Sans, Inter and Tajawal as woff2 under `client/public/fonts` with `@font-face` in `index.css`. Removes the cold-start network dependency (A6) and the third-party request. | Keeping the remote stylesheet |
| 11 | `desktop/` | Delete the tracked `package-lock.json` (recoverable from git history) and the untracked `node_modules`. No source file exists there — verified with `find desktop -maxdepth 1 -mindepth 1 -not -name node_modules`. | Keeping 276 MB of dead Electron |

## 3. Architecture

```
client/
  capacitor.config.ts          webDir dist, appId com.alahliyya.lms, androidScheme https
  android/                     generated by `cap add android`, then hand-edited:
    app/src/main/
      AndroidManifest.xml      FLAG_SECURE host activity, no cleartext, FileProvider
      java/com/alahliyya/lms/
        MainActivity.java      registers LmsNative, sets FLAG_SECURE
        LmsNativePlugin.java   Keystore secure store + deviceId + openFile
      res/xml/
        network_security_config.xml
        file_paths.xml
  src/
    api/native.js              isNative(), platform header, secure-store adapter
    api/download.js            authenticated download, web + native branches
    app/shell.js               back button, keyboard, status bar wiring
```

The client stays one codebase. `native.js` is the only module that imports `@capacitor/*`; everything else asks it questions. On web every Capacitor import resolves to a no-op branch guarded by `Capacitor.isNativePlatform()`, so the web bundle behaviour is unchanged.

### 3.1 Token lifecycle on native

```
login  → server returns { user, accessToken, refreshToken }   (body copy, native only)
       → accessToken to memory; refreshToken to Keystore
resume → read Keystore → POST /auth/refresh { refreshToken } → new pair → rewrite Keystore
logout → POST /auth/logout, then secureRemove
401 SESSION_TERMINATED / TOKEN_REVOKED → secureRemove, route to /login
```

`bootstrapSession()` gains a native branch: instead of relying on the cookie, it reads the Keystore and posts the token. Nothing else in the auth flow changes.

### 3.2 Device identity

`getDeviceId()` becomes async on native: `LmsNative.deviceId()` returns the hash; the value is cached in memory for the process. The web path is unchanged (`localStorage` UUID). The axios request interceptor already sends `x-device-id`; it now waits for the resolved value before the first request, the same way it already waits for the fingerprint.

## 4. Shell behaviour

- **Back button** — `@capacitor/app` `backButton` listener: if a modal or bottom sheet is open, close it; else if the router can go back, `navigate(-1)`; else show a toast and exit on a second press within 2 s.
- **Keyboard** — `@capacitor/keyboard`, `resize: 'body'`, so the player's fixed action bar and the quiz footer ride above the keyboard instead of behind it.
- **Status bar** — `@capacitor/status-bar` set to the brand navy with light content, re-applied when the theme changes.
- **Safe areas** — `env(safe-area-inset-top/bottom/left/right)` padding on the app shell header, the sidebar, the player's fixed bottom bar and the mobile curriculum sheet (A5).
- **Splash** — `@capacitor/splash-screen`, brand navy background, auto-hide after the React root mounts.

## 5. Branding

The institution logo exists only as PDF (`logo ahlyya.pdf`, `logo2 ahlyya.pdf`). It is rasterised to a 1024×1024 PNG by rendering page 1 with `pdfjs-dist` inside the already-installed headless Chromium, then `@capacitor/assets` generates the launcher icons, adaptive icon (navy background + logo foreground) and splash images at every density. No hand-drawn placeholder icon ships.

## 6. Security posture (delta vs. the web client)

| Surface | Web | Android |
|---|---|---|
| Refresh token | httpOnly cookie, JS cannot read it | AndroidKeyStore AES-GCM, key non-exportable |
| Access token | memory | memory |
| Device id | `localStorage` UUID, per browser profile | SHA-256 of `ANDROID_ID`, survives reinstall |
| Screenshots / recording | not preventable | blocked by `FLAG_SECURE` |
| Transport | HTTPS in production | HTTPS enforced in release; cleartext only in the debug variant, only for the dev hosts |
| Secrets in the artifact | none | verified by an APK secret scan (§7) |

## 7. Verification

Every item below is executed, and the report states the real outcome — including failure.

1. `server && npm test` — must stay 113/113.
2. `client && npm run lint` — 0 problems; `npm run build` succeeds.
3. `./gradlew assembleDebug` produces an APK; the report gives its path, byte size, and `aapt2 dump badging` (package, versionCode, minSdk/targetSdk, permissions).
4. **APK secret scan** — unzip the APK; scan `classes*.dex`, `resources.arsc`, `res/`, `assets/` for every secret value in `server/.env` (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `MEDIA_MASTER_KEY`, `MONGODB_URI`, `SMTP_PASS`, `SUPER_ADMIN_PASSWORD`, `DEFAULT_ADMIN_PASSWORD`, `ABDULLAH_PASSWORD`). Requirement: **zero hits**. The scan script is committed so it can be re-run in CI.
5. **Emulator run** — attempt to create an x86_64 AVD, boot it, `adb install` the APK, and log in against the LAN server with a distinct device identity. If the emulator cannot start on this machine (no WHPX/Hyper-V), the report says the APK was built and scanned but **not installed** — it will not claim the app was run.
6. Web regression: the existing Playwright harness re-run at 360/412/768/1440 after the safe-area and font changes; 0 px horizontal overflow must hold.
7. `docs/ANDROID.md` documents the build, the debug/release variants, keystore generation, signing, the AAB path for Play, and the URL swap for a real domain. No keystore or password is committed.

**Definition of done:** an APK exists on disk with a reported path and size; the secret scan returns zero hits; the server suite is 113/113; client lint is 0; the three broken download links work through the authenticated path; `desktop/` is gone; and `docs/ANDROID.md` plus the `SECURITY.md` Android section describe what was actually built, with the emulator result stated truthfully either way.
