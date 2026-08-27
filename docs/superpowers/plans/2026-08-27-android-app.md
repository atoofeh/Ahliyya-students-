# Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Alahliyya LMS as an Android application whose refresh token lives in the AndroidKeyStore, whose screen cannot be captured, and whose APK provably contains no server secret.

**Architecture:** Capacitor 8 wraps the existing Vite build (`client/dist`). One first-party Java plugin, `LmsNative`, provides Keystore-backed storage, a reinstall-stable device id, and file opening. `client/src/api/native.js` is the only module that imports `@capacitor/*`; the rest of the client asks it questions, so the web build is unchanged.

**Tech Stack:** Capacitor 8.5, Android compileSdk 36 / minSdk 24, JDK 21, Gradle (AGP 8.13), `@capacitor/{app,keyboard,status-bar,splash-screen,filesystem}`, `@capacitor/assets` (dev).

## Global Constraints

- Never commit a keystore, a signing password, or any server secret. `*.keystore`/`*.jks` are already gitignored.
- The APK must contain none of: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MEDIA_MASTER_KEY`, `MONGODB_URI`, `SMTP_PASS`, `SUPER_ADMIN_PASSWORD`, `DEFAULT_ADMIN_PASSWORD`, `ABDULLAH_PASSWORD`. Verified by scan, not by inspection.
- `server/storage/` stays read-only. No Mongo writes outside the in-memory test database.
- Server suite must stay at 113/113 and client lint at 0 problems after every task. No `eslint-disable`.
- Never claim the app was run unless it was actually installed and launched.
- appId `com.alahliyya.lms`; appName `Students Alahliyya`; API base for this build `http://192.168.1.115:5000/api/v1`.
- JDK for Gradle: `JAVA_HOME=/c/Program Files/Android/openjdk/jdk-21.0.8` (Java 24 on PATH will not run Gradle).

---

### Task 1: Toolchain, dead scaffold removal, and a Capacitor project that builds

**Files:**
- Delete: `desktop/package-lock.json`, `desktop/node_modules/`
- Create: `client/capacitor.config.ts`, `client/android/` (generated)
- Modify: `client/package.json`, `.gitignore`

- [ ] **Step 1: Confirm `desktop/` holds no source, then remove it**

`find desktop -maxdepth 1 -mindepth 1 -not -name node_modules` must print only `desktop/package-lock.json`.

- [ ] **Step 2: Install SDK 36 (Capacitor 8 needs compileSdk 36)**

`sdkmanager "platforms;android-36" "build-tools;36.0.0"` with `JAVA_HOME` set to JDK 21.

- [ ] **Step 3: Install Capacitor and init**

`npm i @capacitor/core@8 @capacitor/app @capacitor/keyboard @capacitor/status-bar @capacitor/splash-screen @capacitor/filesystem` and `-D @capacitor/cli@8 @capacitor/assets`, then write `capacitor.config.ts` by hand (appId, appName, `webDir: 'dist'`, `androidScheme: 'https'`, splash + keyboard config).

- [ ] **Step 4: Add the Android platform and build once, before any custom code**

`npm run build && npx cap add android && npx cap sync android`, then `./gradlew assembleDebug`. Expected: `BUILD SUCCESSFUL`, an APK under `client/android/app/build/outputs/apk/debug/`. This isolates toolchain failures from our own code.

- [ ] **Step 5: Update `.gitignore` for the new location and commit**

`client/android/app/build/`, `client/android/build/`, `client/android/.gradle/`, `client/android/local.properties`, `client/android/app/release/`, `client/android/capacitor-cordova-android-plugins/`.

---

### Task 2: The `LmsNative` plugin and manifest hardening

**Files:**
- Create: `client/android/app/src/main/java/com/alahliyya/lms/LmsNativePlugin.java`
- Create: `client/android/app/src/main/res/xml/network_security_config.xml`, `res/xml/file_paths.xml`
- Modify: `MainActivity.java`, `AndroidManifest.xml`, `app/build.gradle`

**Interfaces:**
- Produces: `LmsNative.secureSet({key,value})`, `secureGet({key}) -> {value|null}`, `secureRemove({key})`, `deviceId() -> {id}`, `openFile({path,mime})`.

- [ ] **Step 1: Write the plugin**

AES-256-GCM key generated in `AndroidKeyStore` (alias `lms_secure_store_v1`, `setUserAuthenticationRequired(false)`, `setRandomizedEncryptionRequired(true)`), stored as `base64(iv):base64(ct)` in a private SharedPreferences file. `deviceId()` = hex SHA-256 of `Settings.Secure.ANDROID_ID`, falling back to a stored UUID when null/blank/`9774d56d682e549c`. `openFile()` resolves a `FileProvider` URI and fires `ACTION_VIEW` with `FLAG_GRANT_READ_URI_PERMISSION`.

- [ ] **Step 2: Register it and set `FLAG_SECURE` in `MainActivity`**

`registerPlugin(LmsNativePlugin.class)` before `super.onCreate`, then `getWindow().setFlags(FLAG_SECURE, FLAG_SECURE)`.

- [ ] **Step 3: Harden the manifest**

`android:usesCleartextTraffic="false"`, `android:networkSecurityConfig="@xml/network_security_config"`, `android:allowBackup="false"`, `android:fullBackupContent="false"`, and the `FileProvider` `<provider>`. The network config permits cleartext for `192.168.1.115`, `10.0.2.2` and `localhost` **only** in the debug variant.

- [ ] **Step 4: Rebuild and commit**

`./gradlew assembleDebug` must stay `BUILD SUCCESSFUL`.

---

### Task 3: Client native integration

**Files:**
- Create: `client/src/api/native.js`
- Modify: `client/src/api/axios.js`, `client/src/api/fingerprint.js`, `client/src/context/AuthContext.jsx`, `client/.env.android`, `server/.env`

- [ ] **Step 1: Write `native.js`** — `isNative`, `platformName()` (`android`/`web`), `nativeDeviceId()`, `secure.{get,set,remove}` with a no-op web branch.
- [ ] **Step 2: Wire axios** — `withCredentials: !isNative`; `x-client-platform` from `platformName()`; `x-app-version` from `__APP_VERSION__`; the device id resolves through `native.js` on Android.
- [ ] **Step 3: Token lifecycle** — on native, `login`/`refresh` persist `data.refreshToken` to the Keystore, `bootstrapSession` reads it and posts it, `hardLogout` and `logout` call `secure.remove`.
- [ ] **Step 4: Allow the Capacitor origin** — add `https://localhost` to `ALLOWED_ORIGINS` in `server/.env`.
- [ ] **Step 5: Verify** — `npm run lint` 0, `npm run build` succeeds, `server && npm test` 113/113. Commit.

---

### Task 4: Authenticated downloads (fixes the live web bug)

**Files:**
- Create: `client/src/api/download.js`
- Modify: `client/src/pages/student/CoursePlayer.jsx` (2 links), `client/src/pages/teacher/tabs/AssignmentsTab.jsx` (1 link)

- [ ] **Step 1: Write `downloadFile(fileId, filename, mime)`** — `api.get('/files/:id/content?download=1', { responseType: 'blob' })`; web → object URL + `<a download>` + `revokeObjectURL`; native → base64 → `Filesystem.writeFile(Directory.Cache)` → `LmsNative.openFile`.
- [ ] **Step 2: Replace the three `<a href>` links with buttons** that call it, with a loading state and an `ErrorState`/toast on failure.
- [ ] **Step 3: Verify** — lint 0, build, and a Playwright check that clicking the document button on the course player triggers a request carrying `Authorization` (the old link sent none). Commit.

---

### Task 5: Shell behaviour — back, keyboard, status bar, splash, safe areas

**Files:**
- Create: `client/src/app/shell.js`
- Modify: `client/src/main.jsx`, `client/src/layouts/MainLayout.jsx`, `client/src/pages/student/CoursePlayer.jsx`, `client/src/index.css`

- [ ] **Step 1: `shell.js`** — installs the `backButton`, keyboard, status-bar and splash-screen wiring; a no-op on web.
- [ ] **Step 2: Back-button policy** — a small registry (`pushBackHandler`) the `Modal` and the curriculum sheet register with, so back closes the topmost layer first; then `navigate(-1)`; then double-press to exit.
- [ ] **Step 3: Safe areas** — `--safe-top/-bottom/-left/-right` custom properties from `env(safe-area-inset-*)`, applied to the shell header, the sidebar, the player action bar and the curriculum sheet.
- [ ] **Step 4: Verify** — lint 0, build, Playwright pass unchanged (0 px overflow). Commit.

---

### Task 6: Branding — icons and splash from the institution logo

**Files:**
- Create: `client/resources/icon.png`, `client/resources/splash.png`, `client/resources/splash-dark.png`
- Modify: generated `android/app/src/main/res/**`

- [ ] **Step 1: Rasterise `logo ahlyya.pdf` page 1** to a 1024×1024 transparent PNG with `pdfjs-dist` inside the installed headless Chromium.
- [ ] **Step 2: Compose** the icon (logo on the brand navy, adaptive-icon safe zone respected) and the 2732×2732 splash images.
- [ ] **Step 3: `npx @capacitor/assets generate --android`**, then `cap sync`, rebuild.
- [ ] **Step 4: Verify** the generated mipmaps exist at every density and the APK still builds. Commit.

---

### Task 7: Self-hosted fonts

**Files:**
- Create: `client/public/fonts/*.woff2`
- Modify: `client/index.html`, `client/src/index.css`

- [ ] **Step 1: Fetch** the woff2 files for Plus Jakarta Sans (400–800), Inter (400–700) and Tajawal (400/500/700) with the Latin + Arabic subsets.
- [ ] **Step 2: Replace** the `fonts.googleapis.com` `<link>` with local `@font-face` declarations (`font-display: swap`).
- [ ] **Step 3: Verify** — build; check the built HTML contains no `googleapis` reference; Playwright screenshot shows the display face rendering. Commit.

---

### Task 8: Build, secret scan, emulator attempt, docs, CI

**Files:**
- Create: `scripts/scan-apk-secrets.mjs`, `docs/ANDROID.md`
- Modify: `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `README.md`, `CLAUDE.md`, `.github/workflows/ci.yml`

- [ ] **Step 1: Build the debug APK** against the LAN API URL; record path, size, and `aapt2 dump badging`.
- [ ] **Step 2: Write and run the secret scanner** — unzip the APK, read every entry, and search for each secret value from `server/.env` plus a canary. Exit non-zero on any hit. Expected: zero hits, canary detected (proving the scanner works).
- [ ] **Step 3: Attempt an emulator run** — create an x86_64 AVD, boot, `adb install`, log in against the LAN server. Record the true outcome; if it cannot boot, say so and do not claim the app ran.
- [ ] **Step 4: Document** — `docs/ANDROID.md` (build, variants, keystore generation, signing, AAB, URL swap), the `SECURITY.md` Android section (what `FLAG_SECURE` does and does not stop; why no pinning), architecture and README updates.
- [ ] **Step 5: CI quality gate** — a workflow running `server: npm test`, `client: npm run lint && npm run build`, and the secret scanner when an APK is present.
- [ ] **Step 6: Full verification and finish** — server 113/113, client lint 0, build, then merge `feat/android-app` to `main`, tag `android-v1`.
