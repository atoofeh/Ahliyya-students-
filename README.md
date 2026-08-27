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
```

Default administrator: **admin / Admin@12345** (change via `server/.env` → `ADMIN_PASSWORD`).

Run the API test suite: `cd server && npm test` (boots an isolated in-memory instance and walks the full admin → teacher → student journey; 26 assertions).

Optional: install **ffmpeg** on the server host to enable automatic video duration probing and thumbnail generation. Without it, videos are stored and streamed as uploaded.

## Roles

| Capability | Student | Teacher | Admin |
|---|---|---|---|
| Enroll (code / public catalog), watch videos, read PDFs | ✔ | — | — |
| Take quizzes, submit assignments, earn certificates | ✔ | — | — |
| Bookmarks, favorites, progress, Q&A, notifications | ✔ | reply | ✔ |
| Create/edit **own** courses, curriculum, videos, quizzes | — | ✔ | ✔ (any) |
| Grade essays & assignments, view stats, cheat reports | — | own courses | all |
| Access codes, roster, per-student access expiry | — | own courses | all |
| Create users, suspend/ban/delete, reset passwords | — | — | ✔ |
| Force logout, session monitor, platform settings, audit logs | — | — | ✔ |
| Maintenance mode, announcements, global documents | — | — | ✔ |

Teachers cannot touch other teachers' courses (enforced server-side on every course-scoped route).

## Key features

- **Single active session** — logging in on a second device instantly terminates the first (session-bound JWTs validated on every request). Admin-configurable inactivity timeout.
- **Protected video pipeline** — chunked resumable uploads → AES-256-CTR encryption at rest (per-video keys wrapped by a master key) → signed, expiring stream URLs with HTTP Range support → moving identity watermark in the player. No file is ever publicly reachable.
- **Quiz engine** — six question types (MCQ, true/false, short answer, essay, fill-blanks, image), pools, shuffling, negative marking, timed attempts with server-side deadlines, retake limits, scheduling and locking, auto + manual grading, leaderboards, per-question explanations.
- **Anti-cheat proctoring** — tab/window switches, devtools heuristics, copy/paste, right-click, blocked shortcuts, multi-tab detection, fullscreen exits, idle time, refresh, offline events → server-side weighted risk score, auto-submit past threshold, teacher/admin reports. *(See `docs/SECURITY.md` for honest limitations.)*
- **Operations** — audit trail for every security-relevant action, login history with device/browser breakdown, structured log files (`server/logs/`), background jobs (session sweep, enrollment expiry, overdue attempt auto-submit, deadline reminders), maintenance mode.

## Repository layout

```
server/
  server.js            entry point
  src/
    config/            env validation, db, logger, constants, settings cache
    core/              ApiError, mailer, crypto (media encryption), signed URLs, audit
    middleware/        authenticate (session-bound), authorize, validation, security stack, uploads
    models/            18 Mongoose models
    modules/           15 feature modules (auth, admin, courses, videos, quizzes, …)
    routes/v1.js       versioned API composition
    jobs/              background maintenance jobs
  tests/smoke.test.js  end-to-end API suite
  storage/             encrypted videos + documents (never publicly served)
client/
  src/
    api/               axios + refresh rotation, device fingerprint
    context/           auth, theme (dark/light/system), toasts
    components/        UI kit, protected VideoPlayer, ChunkedUploader, search, notifications
    hooks/useAntiCheat.js
    pages/             student / teacher / admin page trees
docs/
  ARCHITECTURE.md      module map, data model, scaling path
  SECURITY.md          threat model + honest browser-limitation disclosure
  API.md               endpoint reference
```

## Production checklist

1. Set real `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `MEDIA_MASTER_KEY` (32+ random bytes each) — the server refuses to start in production without a media key.
2. Point `MONGODB_URI` at a replica set; the dev in-memory fallback is disabled in production.
3. Configure SMTP (`SMTP_HOST` …) for real email delivery; without it, mails are logged.
4. Serve behind HTTPS (the app sets `trust proxy` and secure cookies in production).
5. Set `STORAGE_ROOT` to a dedicated volume; wire `scanBuffer()` in `src/middleware/uploads.js` to a real antivirus engine (ClamAV daemon or a cloud API).
6. For multi-instance scale-out, move background jobs to a worker (see `docs/ARCHITECTURE.md`).
