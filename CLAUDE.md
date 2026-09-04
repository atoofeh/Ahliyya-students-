# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Learning Management System (LMS): Node.js/Express/MongoDB backend (`server/`), React 19/Vite/Tailwind frontend (`client/`). Two separate npm packages — install and run each from its own directory. Git repository initialised 2026-08-27; feature work happens on branches off `main`.

## Commands

```bash
# Backend (server/)
npm run dev        # nodemon, http://localhost:5000 — falls back to in-memory MongoDB if none installed (dev only)
npm start          # production start (refuses without an owner account)
npm test           # node --test over tests/*.test.js — six files sharing tests/helpers/harness.js
                   # (in-memory MongoDB, temp STORAGE_ROOT/LOG_DIR). Filter one file with
                   # node --test --test-name-pattern "<name>" tests/<file>.test.js
npm run lint       # eslint . (flat config, eslint.config.js)
npm run seed       # idempotent bootstrap (owner, default admin, dev admin, settings)
npm run migrate -- --dry-run [--force-relogin]

# Frontend (client/)
npm run dev        # Vite, http://localhost:5173
npm run build
npm run lint       # eslint . — must stay at 0 problems; never add an eslint-disable, fix the cause

# Android (from client/) — see docs/ANDROID.md
npm run build:android   # vite build --mode android (reads .env.android) && cap sync android
npm run android:apk     # the above, then gradlew assembleDebug
                        # JAVA_HOME must point at JDK 21; Gradle will not run on Java 24

# Repo root
node scripts/scan-apk-secrets.mjs   # fails if any server secret is inside a built APK
```

Bootstrap accounts come from `server/.env` (`SUPER_ADMIN_*`, `DEFAULT_ADMIN_*`, dev-only `ADMIN_PASSWORD`) via `server/src/seed.js`; production never seeds a default password. Copy `server/.env.example`. The client reads `VITE_API_URL` from `client/.env` (default `http://localhost:5000/api/v1`); there is no Vite dev proxy — the client calls the API origin directly with CORS.

## Android (client/android)

Capacitor 8 wraps the same Vite build. `client/src/api/native.js` is the **only** module that imports `@capacitor/*`; everything else asks it questions, and the plugin modules are imported dynamically so the web bundle never carries them. One first-party Java plugin, `LmsNativePlugin`, provides AndroidKeyStore storage for the refresh token, a reinstall-stable device id derived from `ANDROID_ID`, and FileProvider-based file opening. The activity carries `FLAG_SECURE`. Release builds permit no cleartext; only the debug variant reaches the LAN dev server. Never let a server secret into the package — `scripts/scan-apk-secrets.mjs` enforces that, and CI runs it.

## Backend architecture (server/src)

Modular monolith. Every request flows:

```
security stack (helmet/cors/sanitize/hpp) → rate limit → /api/v1 router (routes/v1.js)
  → module router → validate(zod) → authenticate (session-bound JWT)
  → authorize(role) / requirePermission(perm) / courseAccess(resource) → controller → service → models
  → errorHandler (single serialization point)
```

- **`modules/`** — 15 feature modules (auth, admin, courses, enrollments, videos, quizzes, assignments, files, anticheat, notifications, announcements, analytics, search, qa, bookmarks). Each owns up to four files: `X.routes.js`, `X.controller.js`, `X.service.js`, `X.validators.js` (smaller modules inline the controller in the routes file). `auth` also owns `device.service.js`. Modules call each other only through services, never through routes. `routes/v1.js` composes them all.
- **`models/`** — 27 shared Mongoose models. Conventions: soft deletes (`deletedAt`) on user-facing entities, answer keys `select:false`, compound indexes on hot paths, denormalized aggregates (course lesson counts, enrollment progress) recomputed by the owning service. `Device` has a partial unique index (one active device per student); `CoTeachInvite` has one preventing duplicate open invitations for the same course and teacher.
- **`core/`** — `ApiError` (throw it from services; `errorHandler` serializes), `asyncHandler`, `audit` (write an audit entry for every security-relevant action — the action must be in `AUDIT_ACTIONS` or the write silently fails), `permissions` (roles → permissions, `isAdminRole`, `canAssignRole`), `cryptoUtils` (AES-256-CTR media encryption, per-video keys wrapped by a **versioned** `MEDIA_MASTER_KEY` — `wrapKey` returns `{ wrapped, keyVersion }`, `unwrapKey(wrapped, keyVersion)`), `signedUrl` (expiring stream URLs), `clamav` (INSTREAM client used by `uploads.scanBuffer`, fail-closed), `redact` (`redactUrl` for logs), `mailer` (logs mail when SMTP unset, never in production), `pagination`.
- **`modules/admin/security.service.js`** — Security Center data: overview counts, platform device list, device-reset request queue. `modules/auth/device.service.js` — bind/verify/revoke/reset-request.
- **`middleware/`** — `authenticate` validates the JWT, its Session record *and* the session's pinned device (`x-device-id`) on every request. `authorize(role)` for legacy role gates (the owner passes any `admin` check); `requirePermission(perm)` for permission gates; `courseAccess` enforces that teachers can only touch courses they run (creator or accepted co-teacher) — required on every course-scoped route, with `requireLessonAccess` as the free-lesson-aware variant. `security.js` exports `requireAllowedOrigin` for cookie-bearing routes. `uploads.js` contains `scanBuffer()`, the single antivirus integration seam.
- **`scripts/` + `migrations/`** — `seed.js` (bootstrap) and `migrate.js` (numbered migrations tracked in `_migrations`, `--dry-run`).
- **`config/`** — `env.js` validates environment at boot (production refuses to start without `MEDIA_MASTER_KEY`); `settingsCache.js` caches the `PlatformSetting` singleton for 15 s.
- **`jobs/`** — background sweeps (sessions, enrollment expiry, overdue quiz attempts, reminders); job bodies are idempotent.
- **`storage/`** — encrypted videos + documents; never served publicly, only via signed URLs / authorized file routes.

## Frontend architecture (client/src)

- **`api/axios.js`** — the single axios instance; access token lives in memory (`api/token.js`), refresh comes from the httpOnly cookie (`bootstrapSession()` on load), device headers from `api/fingerprint.js`. All API calls go through it. `utils/roles.js` mirrors the server's role rules for routing and owns the sidebar nav lists.
- **`hooks/`** — `useAuth`, `useTheme`, `useToast` (each also owns its `createContext`, so `context/*.jsx` export only providers and stay fast-refreshable), plus `useNetworkStatus`, `useFocusTrap`, `useAntiCheat`.
- **Shared UI** — `components/ui.jsx` (kit; `PageIntro` is the default page header, `PageHeader`'s gradient band is reserved for the student-home hero, `Modal` traps focus and closes on Escape), `Skeletons.jsx` (never a centred spinner for page content), `ErrorState.jsx` + `errorCopy.js` (server code → plain language), `Choice.jsx` (accessible quiz radio/checkbox groups), `OfflineBanner.jsx`.
- **Routing** — `App.jsx` lazy-loads every page except the auth screens, with a `SkeletonPage` fallback; recharts therefore ships only with the chart pages.
- **Effects** — the react-hooks v7 rules forbid setting state synchronously in an effect body; the codebase idiom is `useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load])`.
- **`context/`** — auth, theme (dark/light/system), toasts.
- **`pages/`** — separate page trees per role: `student/`, `teacher/`, `admin/`, plus `auth/`. Routing via react-router-dom v7; role layouts in `layouts/`.
- **`hooks/useAntiCheat.js`** — quiz proctoring event capture (tab switches, devtools, copy/paste…) posted to `/anticheat/events`; server computes the weighted risk score.
- **`components/`** — UI kit plus the protected `VideoPlayer` (signed URLs + moving watermark) and `ChunkedUploader` (resumable uploads).

## Security invariants (don't break these)

- Videos/documents are encrypted at rest and must never become directly reachable — always go through signed URLs or authorized file routes.
- Quiz answer keys stay `select:false`; attempt grading and deadlines are server-side.
- Ownership checks (`courseAccess`) on every course-scoped route; audit log writes for security-relevant actions.
- Four roles; the owner (`super_admin`) is bootstrap-only and protected by `AdminService.assertCanManage` — never add a route that accepts `role: 'super_admin'` or bypasses that guard. Owner-only settings keys are listed in `AdminService.OWNER_ONLY_SETTINGS`.
- One authorized device per **student**; teachers, admins and the owner may hold several. `isMultiDeviceRole` in `core/permissions.js` is the single place that decides — do not re-derive it. `Device` partial unique index + session `deviceKeyHash` pinning in `authenticate` and `refresh`; pinning applies to everyone, staff included. Refresh tokens are cookie-only on the web (body copy only for `x-client-platform: android|ios`); the client must never persist a token in web storage.
- **Never compare against `course.teacher` directly.** A course has a creator plus accepted co-teachers; ask `modules/courses/courseStaff.js` (`isCourseStaff`, `courseStaffIds`, `staffCourseFilter`). A stray `{ teacher: id }` filter is a silent privilege bug.
- Free lessons: `isFreeLesson` / `isFreeLessonMedia` in `middleware/courseAccess.js` are the only definition of "readable without enrolling", and the lesson route, the video stream-token issuer and the file server all ask them. Never re-derive the rule.
- Q&A is moderated: a student's question is `pending` until a teacher approves it, and taking part in a thread needs a live enrollment (being the author is not enough).
- Enrollment payments (`amountPaid`, `currency`, `paymentNote`, `paymentRecordedBy/At`) are gated by the `payments.manage` permission — admin and owner only. `EnrollmentService` removes them with its `WITHOUT_PAYMENT` projection on every read a teacher or a student can reach; never widen a projection intending to "hide it in the UI". `Enrollment.package` (`mid`|`final`|`full`) is teaching information and *is* visible to course staff.
- Test fixtures: device ids must be ≥ 8 characters and usernames ≥ 3 (validators reject shorter ones with 400). A test that exercises rate limits sets `process.env.RATE_LIMIT_MULTIPLIER = '1'` on its first line, before requiring the harness (the harness defaults to 100).
- Never rotate `MEDIA_MASTER_KEY` without moving the old value to `MEDIA_MASTER_KEY_PREVIOUS`, bumping `MEDIA_KEY_VERSION`, and running `npm run migrate` — otherwise every stored video becomes undecryptable.
- Login limiting is two buckets (per-IP 30/15 min, per-username 10/15 min); do not collapse them back into one per-IP bucket — a lecture hall shares one NAT.
- Uploads: `persistUpload(file, kind, { allowSvg })` — SVG only for thumbnails and never served inline; `scanBuffer` fails closed when `CLAMAV_HOST` is set.
- `docs/SECURITY.md` documents the threat model and known browser-side anti-cheat limitations — keep its honesty when touching proctoring.

## Docs

`docs/ARCHITECTURE.md` (module map, data model, scaling seams — payments, HLS, object storage), `docs/SECURITY.md` (threat model), `docs/API.md` (endpoint reference).
