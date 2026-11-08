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
- **`models/`** — 32 shared Mongoose models. Conventions: soft deletes (`deletedAt`) on user-facing entities, answer keys `select:false`, compound indexes on hot paths, denormalized aggregates (course lesson counts, enrollment progress) recomputed by the owning service. `Device` has a partial unique index (one active device per student); `CoTeachInvite` has one preventing duplicate open invitations for the same course and teacher.
- **`core/`** — `ApiError` (throw it from services; `errorHandler` serializes), `asyncHandler`, `audit` (write an audit entry for every security-relevant action — the action must be in `AUDIT_ACTIONS` or the write silently fails), `permissions` (roles → permissions, `isAdminRole`, `canAssignRole`), `cryptoUtils` (AES-256-CTR media encryption, per-video keys wrapped by a **versioned** `MEDIA_MASTER_KEY` — `wrapKey` returns `{ wrapped, keyVersion }`, `unwrapKey(wrapped, keyVersion)`), `signedUrl` (expiring stream URLs), `clamav` (INSTREAM client used by `uploads.scanBuffer`, fail-closed), `redact` (`redactUrl` for logs), `mailer` (logs mail when SMTP unset, never in production), `pagination`.
- **`modules/admin/security.service.js`** — Security Center data: overview counts, platform device list, device-reset request queue. `modules/auth/device.service.js` — bind/verify/revoke/reset-request.
- **`middleware/`** — `authenticate` validates the JWT, its Session record *and* the session's pinned device (`x-device-id`) on every request. `authorize(role)` for legacy role gates (the owner passes any `admin` check); `requirePermission(perm)` for permission gates; `courseAccess` enforces that teachers can only touch courses they run (creator or accepted co-teacher) — required on every course-scoped route, with `requireLessonAccess` as the free-lesson-aware variant. `security.js` exports `requireAllowedOrigin` for cookie-bearing routes. `uploads.js` contains `scanBuffer()`, the single antivirus integration seam.
- **`scripts/` + `migrations/`** — `seed.js` (bootstrap) and `migrate.js` (numbered migrations tracked in `_migrations`, `--dry-run`).
- **`config/`** — `env.js` validates environment at boot (production refuses to start without `MEDIA_MASTER_KEY`); `settingsCache.js` caches the `PlatformSetting` singleton for 15 s.
- **`jobs/`** — background sweeps (sessions, enrollment expiry, overdue quiz attempts, reminders); job bodies are idempotent.
- **`storage/`** — encrypted videos + documents; never served publicly, only via signed URLs / authorized file routes.

## Frontend architecture (client/src)

- **`api/axios.js`** — the single axios instance; access token lives in memory (`api/token.js`), refresh comes from the httpOnly cookie (`bootstrapSession()` on load), device headers from `api/fingerprint.js`. All API calls go through it. `utils/roles.js` mirrors the server's role rules for routing and owns the sidebar nav lists.
- **`hooks/`** — `useAuth`, `useTheme`, `useToast`, `useLanguage` (each also owns its `createContext`, so `context/*.jsx` export only providers and stay fast-refreshable), plus `useNetworkStatus`, `useFocusTrap`, `useAntiCheat`.
- **Language** — `i18n/en.js` is the reference dictionary and `i18n/ar.js` mirrors it key for key; `t()` falls back English → key, so a missing string never blanks a screen. Scope is the whole app — student, teacher and administrator screens, the auth screens and the shared chrome — and the switch sits in the header for every role. A new screen ships with both dictionaries filled: an untranslated string rendered right-to-left puts full stops and units on the wrong side. Layout follows `dir` on `<html>`: use Tailwind's **logical** utilities (`ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`, `text-start`, `rounded-s*`/`rounded-e*`) — never `pl-`/`ml-`/`left-`, which do not flip. Text people write (course titles, posts, questions, answers) gets `dir="auto"` so it takes its direction from itself; a line mixing digits with Arabic words gets `.bidi-isolate` on each fragment.
- **Shared UI** — `components/ui.jsx` (kit; `PageIntro` is the default page header, `PageHeader`'s gradient band is reserved for the student-home hero, `Modal` traps focus and closes on Escape), `Skeletons.jsx` (never a centred spinner for page content), `ErrorState.jsx` + `errorCopy.js` (server code → plain language), `Choice.jsx` (accessible quiz radio/checkbox groups), `OfflineBanner.jsx`.
- **Routing** — `App.jsx` lazy-loads every page except the auth screens, with a `SkeletonPage` fallback; recharts therefore ships only with the chart pages.
- **Position utilities don't layer.** Tailwind emits `.relative` *after* `.fixed` and `.absolute` at the same specificity, so a className carrying `relative` unconditionally and adding `fixed` for one state silently stays relative — the element is sized but never lifted out of the flow. Put every position utility inside the branch that wants it. `VideoPlayer`'s expanded layout was broken this way from the day it was written.
- **Effects** — the react-hooks v7 rules forbid setting state synchronously in an effect body; the codebase idiom is `useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load])`.
- **`context/`** — auth, theme (dark/light/system), toasts.
- **`pages/`** — separate page trees per role: `student/`, `teacher/`, `admin/`, plus `auth/`. Routing via react-router-dom v7; role layouts in `layouts/`.
- **`hooks/useAntiCheat.js`** — quiz proctoring event capture (tab switches, devtools, copy/paste…) posted to `/anticheat/events`; server computes the weighted risk score.
- **Welcome tour** — `components/StudentTour.jsx`, mounted by `MainLayout`. It asks a student once, on first arrival, whether they are new; the answer is stored server-side (`POST /auth/tour` → `User.tourCompletedAt`), so it is asked once per account rather than once per device. The header's help button replays it. Steps carry small replicas of the real controls, and the last step is the social accounts — offered, not pressed.
- **Practice** — `components/PracticeQuiz.jsx` (student: one question at a time, verdict from the server, unlimited retries) and `components/PracticeEditor.jsx` (administrators: a question form, a paste-an-exam box parsed by `utils/parseQuestions.js`, and the publish switch). Both hang under a paper on the Past questions page.
- **Social accounts** — `utils/social.js` is the only list (canonical URLs; the shared links' tracking parameters are stripped), rendered by `components/SocialLinks.jsx` as a footer row and as the tour's grid. Brand marks come from `simple-icons`, imported by name so only those six ship.
- **`components/`** — UI kit plus the protected `VideoPlayer` (signed URLs + moving watermark, and the student's remaining watch allowance) and `ChunkedUploader` (resumable uploads). `PoweredByVortex` is the maker's mark: the emblem *is* the V that "ortex" continues from, so the two sit flush with no gap; it renders in the sidebar footer once signed in, again smaller (`size="sm" floating={false}`) under the social accounts at the foot of every page, and floats bottom-left on the auth screens.

## Security invariants (don't break these)

- Videos/documents are encrypted at rest and must never become directly reachable — always go through signed URLs or authorized file routes.
- Quiz answer keys stay `select:false`; attempt grading and deadlines are server-side.
- Ownership checks (`courseAccess`) on every course-scoped route; audit log writes for security-relevant actions.
- Four roles; the owner (`super_admin`) is bootstrap-only and protected by `AdminService.assertCanManage` — never add a route that accepts `role: 'super_admin'` or bypasses that guard. Owner-only settings keys are listed in `AdminService.OWNER_ONLY_SETTINGS`.
- Browser/other clients get one authorized device per **student**; native iOS/Android clients may bind several, and teachers/admins/owner keep their existing account-wide exception. Keep the platform carveout in `DeviceService.isNativeAppPlatform`; `isMultiDeviceRole` in `core/permissions.js` remains the role check. The `Device` partial unique index still limits ordinary accounts to one browser/other device, and sessions stay pinned to their device in `authenticate` and `refresh`. Refresh tokens are cookie-only on the web (body copy only for `x-client-platform: android|ios`); the client must never persist a token in web storage.
- **Never compare against `course.teacher` directly.** A course has a creator plus accepted co-teachers; ask `modules/courses/courseStaff.js` (`isCourseStaff`, `courseStaffIds`, `staffCourseFilter`). A stray `{ teacher: id }` filter is a silent privilege bug.
- Free lessons: `isFreeLesson` / `isFreeLessonMedia` in `middleware/courseAccess.js` are the only definition of "readable without enrolling", and the lesson route, the video stream-token issuer and the file server all ask them. Never re-derive the rule.
- **ffmpeg is required in production.** Without it `#processUpload` stores uploads exactly as they arrived: no duration, no thumbnail, and — the one that breaks playback — the MP4 index left wherever the uploader put it. Phones and screen recorders write the index *after* the media, so a player must fetch the end of the file before the first frame; on a long lecture that reads as "the video doesn't play". The pipeline repackages such files with `-c copy -movflags +faststart` (no re-encode) and takes `sizeBytes` **after** the repackaging, because every Range request is measured against it. `src/scripts/repair-video-index.js` scans, and with `--repair` fixes, videos stored before this existed; it keeps the previous encrypted file in `VIDEO_REPAIR_BACKUP_DIR`. A duration of 0 across the library means ffmpeg is missing — and it also silently disables the watch allowance below.
- The watch allowance (`PlatformSetting.maxVideoViews`, default 4, `0` = off) counts **finished views**, not page opens: `VideoService.#recordWatchTime` accumulates `watchedDelta` from the progress heartbeat and converts it into whole views only when it reaches the video's `durationSeconds`. Never count a view at token issue — seeking and reloading would burn the quota. Course staff and administrators are exempt.
- Practice questions under a past paper (`PracticeQuestion`) are revision, not assessment: no attempt is stored and no score is reported, so they stay out of the graded `Quiz`/`Question` path and its enrollment rules. Their `options.isCorrect` is `select:false` like the question bank, students receive options without the key, and `POST /past-papers/:id/practice/:questionId/check` is the only place an answer meets it. A set is invisible to students until `FileAsset.practicePublished` is set — a wrong answer marked correct teaches the wrong answer.
- Past questions are read-only for students: the file server refuses them `?download` (`VIEW_ONLY`), and the client shows papers only in `components/PdfReader.jsx` (pdf.js onto canvases, watermarked, no save/print). Never open a paper for a student through `downloadFile`, an `<iframe>`/object URL, or the phone's PDF app — each of those offers a save button. `docs/SECURITY.md` states what this cannot stop.
- Q&A is moderated: a student's question is `pending` until a teacher approves it, and taking part in a thread needs a live enrollment (being the author is not enough).
- Enrollment payments (`amountPaid`, `currency`, `paymentNote`, `paymentRecordedBy/At`) are gated by the `payments.manage` permission — admin and owner only. `EnrollmentService` removes them with its `WITHOUT_PAYMENT` projection on every read a teacher or a student can reach; never widen a projection intending to "hide it in the UI". `Enrollment.package` (`mid`|`final`|`full`) is teaching information and *is* visible to course staff.
- Test fixtures: device ids must be ≥ 8 characters and usernames ≥ 3 (validators reject shorter ones with 400). A test that exercises rate limits sets `process.env.RATE_LIMIT_MULTIPLIER = '1'` on its first line, before requiring the harness (the harness defaults to 100).
- Never rotate `MEDIA_MASTER_KEY` without moving the old value to `MEDIA_MASTER_KEY_PREVIOUS`, bumping `MEDIA_KEY_VERSION`, and running `npm run migrate` — otherwise every stored video becomes undecryptable.
- "Keep me signed in" (`Session.rememberMe`) exempts a session from the idle timeout. That exemption must hold in BOTH `middleware/authenticate.js` and `sweepStaleSessions` in `jobs/index.js` — they disagreed once, and the sweep silently undid the middleware. Remembered refresh tokens last `REMEMBERED_SESSION_DAYS` and rotate on use; a remembered session ends by logout, device revoke, password/role change or an administrator, never by a clock.
- Login limiting is two buckets (per-IP 30/15 min, per-username 10/15 min); do not collapse them back into one per-IP bucket — a lecture hall shares one NAT.
- Uploads: `persistUpload(file, kind, { allowSvg })` — SVG only for thumbnails and never served inline; `scanBuffer` fails closed when `CLAMAV_HOST` is set.
- `docs/SECURITY.md` documents the threat model and known browser-side anti-cheat limitations — keep its honesty when touching proctoring.

## Docs

`docs/ARCHITECTURE.md` (module map, data model, scaling seams — payments, HLS, object storage), `docs/SECURITY.md` (threat model), `docs/API.md` (endpoint reference).
