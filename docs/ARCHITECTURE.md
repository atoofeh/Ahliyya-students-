# Architecture

## Shape

A **modular monolith**: one deployable API with 15 self-contained feature modules composed by a versioned router (`src/routes/v1.js`). Each module owns its service, controller/routes, and validators; models are shared domain entities under `src/models`. Modules communicate through services (never through each other's routes), so any module can be split into a microservice later by replacing its `require` with an RPC client.

```
Request → security stack → rate limit → /api/v1 router
        → module router → validate(zod) → authenticate (session-bound)
        → authorize(role) / requirePermission(perm) / courseAccess(resource) → controller → service → models
        → errorHandler (single serialization point)
```

## Modules

| Module | Responsibility |
|---|---|
| `auth` | login/refresh/logout, device binding & revocation, email verification, password lifecycle, own sessions & login history |
| `admin` | user CRUD + status + password resets, owner protections, authorized devices, session control, platform settings, audit/login logs |
| `courses` | courses, sections, lessons, curriculum ordering, catalog |
| `enrollments` | access codes, enrollment (code/public/assigned), roster, progress, certificates |
| `videos` | chunked uploads, encryption, signed streaming, watch progress, watermark data |
| `quizzes` | question bank, quiz CRUD, attempt lifecycle, grading, stats, leaderboards |
| `assignments` | assignment CRUD, submissions, grading |
| `files` | validated uploads, authorized serving, global documents, storage stats |
| `anticheat` | event ingestion, risk scoring, attempt/course/platform reports |
| `notifications` | in-app + email fan-out, unread counts |
| `announcements` | platform-wide and course-scoped announcements |
| `analytics` | student/teacher/course/admin dashboards, exportable platform report |
| `search` | role-scoped global search across 6 entity types |
| `qa` | student questions, threaded replies, resolution |
| `bookmarks` | lesson bookmarks with video timestamps |

## Data model (26 collections)

- **Identity**: `User` (soft-delete, four roles, status, lockout, tokenVersion), `Session` (single-active enforcement, device pinning, refresh hash), `Device` (one active per user — partial unique index), `LoginHistory`.
- **Content**: `Course` → `Section` → `Lesson` (typed: video/pdf/document/text/quiz/assignment), `Video` (upload state + encryption metadata), `FileAsset`.
- **Learning**: `Enrollment` (status, expiry, denormalized progress), `LessonProgress` (resume positions), `Certificate` (verifiable serials), `Bookmark`.
- **Assessment**: `Question` (bank, answer keys `select:false`), `Quiz` (policy + scheduling + pool), `QuizAttempt` (question snapshots, grading state, risk score), `Assignment`, `Submission`.
- **Platform**: `Notification` (TTL-indexed), `Announcement`, `AuditLog`, `CheatEvent`, `PlatformSetting` (singleton, cached 15 s).
- **Community**: `QAThread`, `Bookmark`, `AccessCode`.
- **Ops**: `Migration` (`_migrations` — applied data migrations).

Conventions: soft deletes (`deletedAt`) on user-facing entities; compound indexes on every hot path (unique `student+course`, `student+lesson`, leaderboard `quiz+percent`); text indexes for search; denormalized aggregates (course lesson counts, enrollment progress) recomputed by the owning service.

## Roles & permissions

`super_admin` (owner) > `admin` > `teacher` > `student`. `src/core/permissions.js` maps roles to named permissions; routes declare needs with `requirePermission()`, legacy routes use `authorize()` (the owner satisfies any `admin` check). Target-level rules — nobody mutates the owner but the owner, admins cannot manage admins, nobody mutates their own account through admin routes, `super_admin` is never assignable — live in `AdminService.assertCanManage`. Course ownership stays in `courseAccess`.

## Bootstrap & migrations

- `npm run seed` — idempotent: creates the owner (`SUPER_ADMIN_*`), the default admin (`DEFAULT_ADMIN_*`) and, outside production, the legacy `admin` (`ADMIN_PASSWORD`). Development startup runs it automatically; production startup only verifies an owner exists and exits otherwise.
- `npm run migrate [-- --dry-run] [-- --force-relogin]` — applies `src/migrations/*` not yet recorded in `_migrations`. `--force-relogin` bumps every `tokenVersion` and ends every session so the institution re-binds under the device policy.

## Scaling path (thousands of concurrent users)

Already in place: stateless auth (any instance can serve any request — session state is in MongoDB), pagination everywhere, lean queries with tight projections, aggregate-pipeline analytics, settings cache, throttled session writes, compression, Range-based streaming (players fetch only what they watch).

To scale horizontally:
1. Run N API instances behind a load balancer (nothing is instance-local except `storage/` — mount shared or object storage; the storage layer resolves paths through one seam in `uploads.js`/`videos.service.js`).
2. Move `src/jobs` into a single worker process (or BullMQ + Redis) so sweeps don't run N times. Job bodies are idempotent already.
3. Replace the in-process rate limiter store with Redis (`express-rate-limit` accepts a store).
4. Offload video bytes to object storage + CDN with signed URLs — the signing seam (`core/signedUrl.js`) matches CloudFront/GCS semantics.

## Future-ready seams

- **Payments/subscriptions**: `Course.price/currency` exist; enrollment flows call a single private `#enroll` — a payment check drops in before it.
- **AI tutor / question generation**: question bank has a clean service API (`QuizService.createQuestion`) that a generator can feed; Q&A threads are the tutor's conversation surface.
- **Live classes / forums / mobile apps**: JWT + versioned JSON API is client-agnostic; add `/api/v2` alongside v1 without touching modules.
- **Certificates with QR codes**: `GET /enrollments/certificates/verify/:serial` is already public — encode that URL in a QR.
- **Virus scanning**: `scanBuffer()` in `middleware/uploads.js` is the single integration point.
- **HLS/DRM**: `Video.renditions` schema exists; a transcoder worker can populate it and the player can switch to HLS manifests without API changes.
