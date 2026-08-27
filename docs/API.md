# API Reference (v1)

Base URL: `/api/v1`. All endpoints return JSON. Authenticated endpoints require `Authorization: Bearer <accessToken>` plus an `x-device-id` header that must match the device the session was created from (optional `x-fingerprint`, `x-client-platform`, `x-app-version`). Errors use `{ message, code?, errors? }`.

Roles: **P** public · **A** any authenticated · **S** student · **T** teacher (course owner where course-scoped) · **AD** admin · **O** owner (`super_admin`). Course-scoped teacher routes also allow admins; admin routes admit the owner.

## Auth — `/auth`
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/login` | P | `{username, password, deviceId, fingerprint?, rememberMe?}` → `{user, accessToken}` + httpOnly refresh cookie (body also includes `refreshToken` when `x-client-platform` is `android`/`ios`). `403 DEVICE_NOT_AUTHORIZED` from a second device. Ends other sessions. |
| POST | `/refresh` | P | cookie (or body for native clients); rotates; reuse or device mismatch ends the session. Checks `Origin`. |
| POST | `/forgot-password`, `/reset-password` | P | 6-digit emailed code |
| POST | `/logout` | A | `{forgetDevice?: boolean}` — ends the session; with `forgetDevice` also revokes the authorized device. Checks `Origin`. |
| GET | `/device` | A | caller's authorized device (public fields) |
| POST | `/device/reset-request` | P | `{username, note?}` → always `202`; stored only for real accounts; 3/h per IP, 3/day per username |
| GET/PATCH | `/me` | A | profile + preferences (theme, email notifications) |
| POST | `/resend-verification`, `/verify-email`, `/set-password`, `/change-password` | A | onboarding + credential lifecycle |
| GET | `/sessions`, `/login-history` | A | own device/session history |

## Admin — `/admin` (permission-gated; AD and O)
`POST/GET /users` (creating an `admin` is O only; `super_admin` is never creatable), `GET/PUT /users/:id`, `POST /users/:id/status` (active/suspended/banned), `POST /users/:id/reset-password`, `POST /users/:id/force-logout`, `DELETE /users/:id` (soft), `GET /users/:id/device`, `POST /users/:id/device/revoke {reason}`, `GET /sessions`, `POST /sessions/:id/terminate`, `GET/PUT /settings` (owner-only keys → `403 OWNER_PROTECTED` for AD), `GET /audit-logs`, `GET /login-history`.
Mutations targeting the owner, or an admin by a non-owner, return `403 OWNER_PROTECTED` / `403 FORBIDDEN`; targeting yourself returns `400 SELF_ACTION`.

Security Center: `GET /security/overview` (counts + suspicious events + recent security audit), `GET /devices?search&status&page` (platform device list, hashes never returned), `GET /device-requests?status=open|resolved|dismissed`, `POST /device-requests/:id/resolve {action: 'revoke'|'dismiss', resolution?}`.

## Courses — `/courses`
| Method | Path | Access |
|---|---|---|
| GET | `/catalog` | A (published+public) |
| GET | `/mine` | T/AD |
| POST | `/` | T/AD |
| GET | `/:courseId` | enrolled S / owner T / AD — returns course + curriculum + progress |
| PUT/DELETE | `/:courseId` | owner/AD |
| POST/PUT/DELETE | `/:courseId/sections[/:sectionId]` | owner/AD |
| POST/PUT/DELETE | `/:courseId/lessons[/:lessonId]` | owner/AD |
| GET | `/:courseId/lessons/:lessonId` | enrolled S / owner / AD |
| POST | `/:courseId/reorder` | owner/AD |

## Enrollments — `/enrollments`
`POST /redeem` (S, access code) · `POST /courses/:id/enroll` (S, public courses) · `GET /mine` (S) · `POST /courses/:id/favorite` (S) · `POST /courses/:id/lessons/:lid/complete` (S) · `GET /certificates/mine` (S) · `GET /certificates/verify/:serial` (**public**) · codes (AD/O only): `POST/GET /courses/:id/codes`, `POST /courses/:id/codes/:codeId/revoke` · roster (course owner/AD/O): `GET /courses/:id/students`, `DELETE /courses/:id/students/:sid`, `POST /courses/:id/students/:sid/expire` · direct assignment (AD/O only): `POST /courses/:id/students`.

## Videos — `/videos`
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/courses/:courseId/uploads` | T/AD | init chunked upload → `{uploadId, chunkSize, totalChunks}` |
| POST | `/uploads/:uploadId/chunks` | T/AD | multipart `chunk` + `chunkIndex`; idempotent |
| GET | `/uploads/:uploadId/status` | T/AD | resume support (received chunk list) |
| POST | `/uploads/:uploadId/complete` | T/AD | assemble → probe → encrypt (async) |
| POST | `/:videoId/token` | enrolled/owner/AD | 5-min signed stream token |
| GET | `/:videoId/stream?token=` | token | Range-capable decrypting stream; session must be active |
| POST | `/:videoId/progress` | S | `{lessonId, positionSeconds, watchedDelta}` |
| GET | `/watermark/me` | A | watermark lines for the player |
| GET | `/courses/:courseId` | owner/AD | list course videos |
| DELETE | `/:videoId` | owner/AD | |

## Quizzes — `/quizzes`
Question bank (owner/AD): `GET/POST /courses/:id/questions`, `PUT/DELETE /courses/:id/questions/:qid`.
Quizzes: `GET /courses/:id` (A; students get attempt summaries, no keys) · `POST/PUT/DELETE /courses/:id[/:quizId]` (owner/AD; `isLocked`, scheduling, pool, anti-cheat policy).
Attempts: `POST /courses/:id/:quizId/start` (S) · `POST /attempts/:aid/answers` (S autosave; `{answers, clientSavedAt?}` → `{saved, stale?, savedAt}` — a payload older than the last accepted one is ignored) · `POST /attempts/:aid/submit` (S) · `GET /attempts/mine` (S) · `GET /attempts/:aid` (owner of attempt or staff) · `POST /attempts/:aid/grade` (T/AD manual grading) · `POST /attempts/:aid/invalidate` (T/AD).
Insights: `GET /courses/:id/:quizId/attempts|stats` (owner/AD) · `GET .../leaderboard` (A, if enabled) · `POST .../remind` (owner/AD).

## Assignments — `/assignments`
`POST/GET /courses/:id` · `PUT/DELETE /courses/:id/:aid` (owner/AD) · `POST /courses/:id/:aid/submit` (S) · `GET /courses/:id/:aid/submissions` (owner/AD) · `POST /submissions/:sid/grade` (T/AD).

## Files — `/files`
`POST /courses/:id/documents|images` (owner/AD) · `POST /global` (AD) + `GET /global` (A) · `POST /submissions` (S) · `POST /avatar` (A) · `GET /courses/:id` (course access) · `GET /:fileId/content` (scope-checked serving; SVG always as attachment) · `DELETE /:fileId` (uploader/AD). Upload errors: `400 BAD_FILE_TYPE` (extension / declared MIME), `400 BAD_FILE_CONTENT` (magic bytes), `400 MALWARE_SUSPECTED`, `503 SCANNER_UNAVAILABLE` (ClamAV configured but unreachable).

## Anti-cheat — `/anticheat`
`POST /events` (S, batched proctor events → `{riskScore, violationCount, autoSubmitted}`) · `GET /attempts/:aid` (T/AD timeline) · `GET /courses/:id` (owner/AD) · `GET /platform` (AD).

## Others
- **Notifications** `/notifications`: `GET /`, `GET /unread-count`, `POST /:id/read`, `POST /read-all` (A).
- **Announcements** `/announcements`: `GET /feed` (A) · `POST /global` (AD) · `POST/GET /courses/:id` · `DELETE /:id` (author/AD).
- **Analytics** `/analytics`: `/student` (S) · `/teacher` (T) · `/courses/:id` (owner/AD) · `/admin`, `/admin/report` (AD).
- **Search** `/search?q=` (A, role-scoped across courses/lessons/quizzes/videos/assignments/people).
- **Q&A** `/qa`: `POST/GET /courses/:id` (course access) · `POST /:threadId/replies` · `POST /:threadId/resolve`.
- **Bookmarks** `/bookmarks`: `POST /`, `GET /`, `DELETE /:id` (S).
- **Health**: `GET /api/health` (public).
