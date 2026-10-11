# LMS Platform

A commercial-grade Learning Management System for educational institutions: video lectures with encrypted streaming, a full quiz engine with anti-cheat proctoring, assignments and grading, certificates, analytics, and a complete admin control plane.

Built as a modular monolith: **Node.js / Express / MongoDB** backend, **React 19 / Vite / Tailwind** frontend.

## Quick start

```bash
# Backend (falls back to in-memory MongoDB if none is installed — dev only)
cd server
npm install
npm run dev          # http://localhost:5000

# Frontend
cd client
npm install
npm run dev          # http://localhost:5173

# Android APK (needs JDK 21 and the Android SDK — see docs/ANDROID.md)
cd client
npm run android:apk  # -> android/app/build/outputs/apk/debug/app-debug.apk
```

Accounts are bootstrapped from `server/.env` by `npm run seed` (run automatically in development): the **owner** (`SUPER_ADMIN_*`), the default **administrator** Abdullah Dabbas (`DEFAULT_ADMIN_*`) and, in development only, `admin` (`ADMIN_PASSWORD`). Every bootstrapped account must change its password at first login. There is no default password — copy `server/.env.example` and fill it in.

Run the API test suite: `cd server && npm test` (six `node:test` files against an isolated in-memory MongoDB and temp storage: smoke journey, permissions, RBAC, owner protections, device binding, authentication, bootstrap/migrations). Lint with `npm run lint` in each package.

Optional: install **ffmpeg** on the server host to enable automatic video duration probing and thumbnail generation. Without it, videos are stored and streamed as uploaded.

## iOS build

The iOS Capacitor project and native Swift bridge are checked in. Build and sign it with Xcode on a Mac; see [docs/IOS.md](docs/IOS.md) for the steps and iOS-specific notification and screen-capture limits.

## Roles

| Capability | Student | Teacher | Admin | Owner |
|---|---|---|---|---|
| Enroll (code / public catalog), watch videos, read PDFs | ✔ | — | — | — |
| Take quizzes, submit assignments, earn certificates | ✔ | — | — | — |
| Bookmarks, favorites, progress, Q&A, notifications | ✔ | reply | ✔ | ✔ |
| Create/edit **own** courses, curriculum, videos, quizzes | — | ✔ | ✔ (any) | ✔ (any) |
| Grade essays & assignments, view stats, cheat reports | — | own courses | all | all |
| Roster: view, remove a student, set per-student expiry | — | own courses | all | all |
| Access codes, assign students directly | — | — | ✔ | ✔ |
| Create students & teachers, suspend/ban/delete, reset passwords | — | — | ✔ | ✔ |
| Revoke a user's authorized device | — | — | students & teachers | anyone |
| Force logout, session monitor, audit logs, announcements | — | — | ✔ | ✔ |
| Platform settings, maintenance mode | — | — | ✔ | ✔ |
| Create/suspend administrators, security policy (timeouts, lockout, device binding) | — | — | — | ✔ |

Teachers cannot touch other teachers' courses; admins cannot touch the owner or other admins (all enforced server-side).

## Key features

- **One account, one authorized device** — the first login binds the device; a second device is refused until an administrator revokes the first. Sessions are pinned to their device, refresh tokens rotate, and the web client never stores a token in JavaScript-readable storage. Owner-configurable inactivity timeout and lockout.
- **Protected video pipeline** — chunked resumable uploads → AES-256-CTR encryption at rest (per-video keys wrapped by a master key) → signed, expiring stream URLs with HTTP Range support → moving identity watermark in the player. No file is ever publicly reachable.
- **Quiz engine** — six question types (MCQ, true/false, short answer, essay, fill-blanks, image), pools, shuffling, negative marking, timed attempts with server-side deadlines, retake limits, scheduling and locking, auto + manual grading, leaderboards, per-question explanations.
- **Anti-cheat proctoring** — tab/window switches, devtools heuristics, copy/paste, right-click, blocked shortcuts, multi-tab detection, fullscreen exits, idle time, refresh, offline events → server-side weighted risk score, auto-submit past threshold, teacher/admin reports. *(See `docs/SECURITY.md` for honest limitations.)*
- **Operations** — audit trail for every security-relevant action, login history with device/browser breakdown, structured log files (`server/logs/`, secrets redacted), background jobs (session sweep, enrollment expiry, overdue attempt auto-submit, idempotent deadline reminders), maintenance mode.
- **Owner Security Center** — sessions, failed logins, locked accounts, platform-wide authorized devices with revoke, self-service device-reset requests reviewed by administrators, and the owner-only security policy. Uploads pass extension + MIME + magic-byte checks and an optional ClamAV daemon (fail-closed).
- **Task-first study experience** — the student home opens on *continue learning* and what is due next; the course player puts the lesson first with the curriculum in a rail (a bottom sheet on phones) and a reachable action bar; quizzes keep unsent answers on the device and resend them when the connection returns; choices are keyboard-operable and dialogs trap focus.

## Repository layout

```
server/
  server.js            entry point
  src/
    config/            env validation, db, logger, constants, settings cache
    core/              ApiError, mailer, crypto (media encryption), signed URLs, audit
    middleware/        authenticate (session-bound), authorize, validation, security stack, uploads
    models/            26 Mongoose models
    modules/           15 feature modules (auth, admin, courses, videos, quizzes, …)
    routes/v1.js       versioned API composition
    jobs/              background maintenance jobs
    scripts/           seed.js, migrate.js
    migrations/        numbered data migrations
  tests/               node:test suites + helpers/harness.js
  storage/             encrypted videos + documents (never publicly served)
client/
  src/
    api/               axios + refresh rotation, device identity, native bridge, downloads
    app/shell.js       Android back button, keyboard, system bars, splash
    context/           auth, theme (dark/light/system), toasts
    components/        UI kit, protected VideoPlayer, ChunkedUploader, search, notifications
    hooks/useAntiCheat.js
    pages/             student / teacher / admin page trees
  public/fonts/        self-hosted brand faces (no third-party request at first paint)
  resources/           launcher icon + splash sources
  android/             Capacitor project: LmsNativePlugin (Keystore, device id, file open)
  ios/                 Capacitor project: Keychain, device id, document preview, capture cover
scripts/
  scan-apk-secrets.mjs fails if a built APK contains any server secret
docs/
  ARCHITECTURE.md      module map, data model, scaling path
  SECURITY.md          threat model + honest browser-limitation disclosure
  API.md               endpoint reference
  ANDROID.md           build, signing, release, and what the native layer does
  IOS.md               Xcode build, signing, and iOS platform limits
```

## Production checklist

0. Set `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_INITIAL_PASSWORD` (and `DEFAULT_ADMIN_*`), then run `npm run seed` once. The server refuses to start in production without an owner account.
1. Set real `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `MEDIA_MASTER_KEY` (32+ random bytes each) — the server refuses to start in production without a media key.
2. Point `MONGODB_URI` at a replica set; the dev in-memory fallback is disabled in production.
3. Configure SMTP (`SMTP_HOST` …) for real email delivery; without it, mails are logged.
4. Serve behind HTTPS (the app sets `trust proxy` and secure cookies in production).
5. Set `STORAGE_ROOT` to a dedicated volume; run a ClamAV daemon and set `CLAMAV_HOST` (uploads fail closed if it is down). Keep `JWT_SECRET`, `JWT_REFRESH_SECRET` and `MEDIA_MASTER_KEY` distinct — the server refuses to start otherwise. Rotate the media key only via `MEDIA_MASTER_KEY_PREVIOUS` + `MEDIA_KEY_VERSION` + `npm run migrate` (see `docs/SECURITY.md`).
6. For multi-instance scale-out, move background jobs to a worker (see `docs/ARCHITECTURE.md`).
