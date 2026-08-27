# Architecture

## Shape

A **modular monolith**: one deployable API with 15 self-contained feature modules composed by a versioned router (`src/routes/v1.js`). Each module owns its service, controller/routes, and validators; models are shared domain entities under `src/models`. Modules communicate through services (never through each other's routes), so any module can be split into a microservice later by replacing its `require` with an RPC client.

```
Request → security stack → rate limit → /api/v1 router
        → module router → validate(zod) → authenticate (session-bound)
        → authorize(role) / courseAccess(resource) → controller → service → models
        → errorHandler (single serialization point)
```

## Modules

| Module | Responsibility |
|---|---|
| `auth` | login/refresh/logout, registration, email verification, password lifecycle, own sessions & login history |
| `admin` | user CRUD + status + password resets, session control, platform settings, audit/login logs |
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

## Data model (18 collections)

- **Identity**: `User` (soft-delete, status, lockout, tokenVersion), `Session` (single-active enforcement, device identity, refresh hash), `LoginHistory`.
- **Content**: `Course` → `Section` → `Lesson` (typed: video/pdf/document/text/quiz/assignment), `Video` (upload state + encryption metadata), `FileAsset`.
- **Learning**: `Enrollment` (status, expiry, denormalized progress), `LessonProgress` (resume positions), `Certificate` (verifiable serials), `Bookmark`.
- **Assessment**: `Question` (bank, answer keys `select:false`), `Quiz` (policy + scheduling + pool), `QuizAttempt` (question snapshots, grading state, risk score), `Assignment`, `Submission`.
- **Platform**: `Notification` (TTL-indexed), `Announcement`, `AuditLog`, `CheatEvent`, `PlatformSetting` (singleton, cached 15 s).

Conventions: soft deletes (`deletedAt`) on user-facing entities; compound indexes on every hot path (unique `student+course`, `student+lesson`, leaderboard `quiz+percent`); text indexes for search; denormalized aggregates (course lesson counts, enrollment progress) recomputed by the owning service.

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
