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
npm run lint       # eslint . — 13 pre-existing react-hooks v7 errors in ThemeContext/ToastContext/VideoPlayer/useAntiCheat (UI spec)
```

Bootstrap accounts come from `server/.env` (`SUPER_ADMIN_*`, `DEFAULT_ADMIN_*`, dev-only `ADMIN_PASSWORD`) via `server/src/seed.js`; production never seeds a default password. Copy `server/.env.example`. The client reads `VITE_API_URL` from `client/.env` (default `http://localhost:5000/api/v1`); there is no Vite dev proxy — the client calls the API origin directly with CORS.

## Backend architecture (server/src)

Modular monolith. Every request flows:

```
security stack (helmet/cors/sanitize/hpp) → rate limit → /api/v1 router (routes/v1.js)
  → module router → validate(zod) → authenticate (session-bound JWT)
  → authorize(role) / requirePermission(perm) / courseAccess(resource) → controller → service → models
  → errorHandler (single serialization point)
```

- **`modules/`** — 15 feature modules (auth, admin, courses, enrollments, videos, quizzes, assignments, files, anticheat, notifications, announcements, analytics, search, qa, bookmarks). Each owns up to four files: `X.routes.js`, `X.controller.js`, `X.service.js`, `X.validators.js` (smaller modules inline the controller in the routes file). `auth` also owns `device.service.js`. Modules call each other only through services, never through routes. `routes/v1.js` composes them all.
- **`models/`** — 26 shared Mongoose models. Conventions: soft deletes (`deletedAt`) on user-facing entities, answer keys `select:false`, compound indexes on hot paths, denormalized aggregates (course lesson counts, enrollment progress) recomputed by the owning service. `Device` has a partial unique index (one active device per user).
- **`core/`** — `ApiError` (throw it from services; `errorHandler` serializes), `asyncHandler`, `audit` (write an audit entry for every security-relevant action — the action must be in `AUDIT_ACTIONS` or the write silently fails), `permissions` (roles → permissions, `isAdminRole`, `canAssignRole`), `cryptoUtils` (AES-256-CTR media encryption, per-video keys wrapped by `MEDIA_MASTER_KEY`), `signedUrl` (expiring stream URLs), `mailer` (logs mail when SMTP unset), `pagination`.
- **`middleware/`** — `authenticate` validates the JWT, its Session record *and* the session's pinned device (`x-device-id`) on every request. `authorize(role)` for legacy role gates (the owner passes any `admin` check); `requirePermission(perm)` for permission gates; `courseAccess` enforces teachers can only touch their own courses — required on every course-scoped route. `security.js` exports `requireAllowedOrigin` for cookie-bearing routes. `uploads.js` contains `scanBuffer()`, the single antivirus integration seam.
- **`scripts/` + `migrations/`** — `seed.js` (bootstrap) and `migrate.js` (numbered migrations tracked in `_migrations`, `--dry-run`).
- **`config/`** — `env.js` validates environment at boot (production refuses to start without `MEDIA_MASTER_KEY`); `settingsCache.js` caches the `PlatformSetting` singleton for 15 s.
- **`jobs/`** — background sweeps (sessions, enrollment expiry, overdue quiz attempts, reminders); job bodies are idempotent.
- **`storage/`** — encrypted videos + documents; never served publicly, only via signed URLs / authorized file routes.

## Frontend architecture (client/src)

- **`api/axios.js`** — the single axios instance; access token lives in memory (`api/token.js`), refresh comes from the httpOnly cookie (`bootstrapSession()` on load), device headers from `api/fingerprint.js`. All API calls go through it. `utils/roles.js` mirrors the server's role rules for routing.
- **`context/`** — auth, theme (dark/light/system), toasts.
- **`pages/`** — separate page trees per role: `student/`, `teacher/`, `admin/`, plus `auth/`. Routing via react-router-dom v7; role layouts in `layouts/`.
- **`hooks/useAntiCheat.js`** — quiz proctoring event capture (tab switches, devtools, copy/paste…) posted to `/anticheat/events`; server computes the weighted risk score.
- **`components/`** — UI kit plus the protected `VideoPlayer` (signed URLs + moving watermark) and `ChunkedUploader` (resumable uploads).

## Security invariants (don't break these)

- Videos/documents are encrypted at rest and must never become directly reachable — always go through signed URLs or authorized file routes.
- Quiz answer keys stay `select:false`; attempt grading and deadlines are server-side.
- Ownership checks (`courseAccess`) on every course-scoped route; audit log writes for security-relevant actions.
- Four roles; the owner (`super_admin`) is bootstrap-only and protected by `AdminService.assertCanManage` — never add a route that accepts `role: 'super_admin'` or bypasses that guard. Owner-only settings keys are listed in `AdminService.OWNER_ONLY_SETTINGS`.
- One authorized device per account: `Device` partial unique index + session `deviceKeyHash` pinning in `authenticate` and `refresh`. Refresh tokens are cookie-only on the web (body copy only for `x-client-platform: android|ios`); the client must never persist a token in web storage.
- Test fixtures: device ids must be ≥ 8 characters and usernames ≥ 3 (validators reject shorter ones with 400).
- `docs/SECURITY.md` documents the threat model and known browser-side anti-cheat limitations — keep its honesty when touching proctoring.

## Docs

`docs/ARCHITECTURE.md` (module map, data model, scaling seams — payments, HLS, object storage), `docs/SECURITY.md` (threat model), `docs/API.md` (endpoint reference).
