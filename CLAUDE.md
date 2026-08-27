# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Learning Management System (LMS): Node.js/Express/MongoDB backend (`server/`), React 19/Vite/Tailwind frontend (`client/`). Two separate npm packages — install and run each from its own directory. Note: this directory is not a git repository.

## Commands

```bash
# Backend (server/)
npm run dev        # nodemon, http://localhost:5000 — falls back to in-memory MongoDB if none installed (dev only)
npm start          # production start
npm test           # runs tests/smoke.test.js — the only test suite; a single end-to-end
                   # API script (admin → teacher → student journey) against an isolated
                   # in-memory MongoDB. No test framework; no per-test filtering.

# Frontend (client/)
npm run dev        # Vite, http://localhost:5173
npm run build
npm run lint       # eslint . (client only; the server has no linter)
```

Default admin credentials come from `server/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`), seeded by `server/src/seed.js`. The client reads `VITE_API_URL` from `client/.env` (default `http://localhost:5000/api/v1`); there is no Vite dev proxy — the client calls the API origin directly with CORS.

## Backend architecture (server/src)

Modular monolith. Every request flows:

```
security stack (helmet/cors/sanitize/hpp) → rate limit → /api/v1 router (routes/v1.js)
  → module router → validate(zod) → authenticate (session-bound JWT)
  → authorize(role) / courseAccess(resource) → controller → service → models
  → errorHandler (single serialization point)
```

- **`modules/`** — 15 feature modules (auth, admin, courses, enrollments, videos, quizzes, assignments, files, anticheat, notifications, announcements, analytics, search, qa, bookmarks). Each module owns exactly four files: `X.routes.js`, `X.controller.js`, `X.service.js`, `X.validators.js`. Modules call each other only through services, never through routes. `routes/v1.js` composes them all.
- **`models/`** — 18 shared Mongoose models. Conventions: soft deletes (`deletedAt`) on user-facing entities, answer keys `select:false`, compound indexes on hot paths, denormalized aggregates (course lesson counts, enrollment progress) recomputed by the owning service.
- **`core/`** — `ApiError` (throw it from services; `errorHandler` serializes), `asyncHandler`, `audit` (write an audit entry for every security-relevant action), `cryptoUtils` (AES-256-CTR media encryption, per-video keys wrapped by `MEDIA_MASTER_KEY`), `signedUrl` (expiring stream URLs), `mailer` (logs mail when SMTP unset), `pagination`.
- **`middleware/`** — `authenticate` validates the JWT *and* its Session record on every request (single-active-session enforcement; a second login kills the first). `authorize(role)` for role gates; `courseAccess` enforces teachers can only touch their own courses — required on every course-scoped route. `uploads.js` contains `scanBuffer()`, the single antivirus integration seam.
- **`config/`** — `env.js` validates environment at boot (production refuses to start without `MEDIA_MASTER_KEY`); `settingsCache.js` caches the `PlatformSetting` singleton for 15 s.
- **`jobs/`** — background sweeps (sessions, enrollment expiry, overdue quiz attempts, reminders); job bodies are idempotent.
- **`storage/`** — encrypted videos + documents; never served publicly, only via signed URLs / authorized file routes.

## Frontend architecture (client/src)

- **`api/axios.js`** — the single axios instance with refresh-token rotation and device fingerprint headers (`api/fingerprint.js`). All API calls go through it.
- **`context/`** — auth, theme (dark/light/system), toasts.
- **`pages/`** — separate page trees per role: `student/`, `teacher/`, `admin/`, plus `auth/`. Routing via react-router-dom v7; role layouts in `layouts/`.
- **`hooks/useAntiCheat.js`** — quiz proctoring event capture (tab switches, devtools, copy/paste…) posted to `/anticheat/events`; server computes the weighted risk score.
- **`components/`** — UI kit plus the protected `VideoPlayer` (signed URLs + moving watermark) and `ChunkedUploader` (resumable uploads).

## Security invariants (don't break these)

- Videos/documents are encrypted at rest and must never become directly reachable — always go through signed URLs or authorized file routes.
- Quiz answer keys stay `select:false`; attempt grading and deadlines are server-side.
- Ownership checks (`courseAccess`) on every course-scoped route; audit log writes for security-relevant actions.
- `docs/SECURITY.md` documents the threat model and known browser-side anti-cheat limitations — keep its honesty when touching proctoring.

## Docs

`docs/ARCHITECTURE.md` (module map, data model, scaling seams — payments, HLS, object storage), `docs/SECURITY.md` (threat model), `docs/API.md` (endpoint reference).
