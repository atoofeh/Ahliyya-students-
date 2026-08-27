# API Reference (v1)

Base URL: `/api/v1`. All endpoints return JSON. Authenticated endpoints require `Authorization: Bearer <accessToken>` plus an `x-device-id` header (and optional `x-fingerprint`). Errors use `{ message, code?, errors? }`.

Roles: **P** public · **A** any authenticated · **S** student · **T** teacher (course owner where course-scoped) · **AD** admin. Course-scoped teacher routes also allow admins.

## Auth — `/auth`
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/login` | P | `{username, password, deviceId, fingerprint?, rememberMe?}` → tokens; terminates other sessions |
| POST | `/refresh` | P | rotating refresh (cookie or body); reuse detection kills session |
| POST | `/forgot-password`, `/reset-password` | P | 6-digit emailed code |
| POST | `/logout` | A | ends current session |
| GET/PATCH | `/me` | A | profile + preferences (theme, email notifications) |
| POST | `/resend-verification`, `/verify-email`, `/set-password`, `/change-password` | A | onboarding + credential lifecycle |
| GET | `/sessions`, `/login-history` | A | own device/session history |

## Admin — `/admin` (all AD)
`POST/GET /users`, `GET/PUT /users/:id`, `POST /users/:id/status` (active/suspended/banned), `POST /users/:id/reset-password`, `POST /users/:id/force-logout`, `DELETE /users/:id` (soft), `GET /sessions`, `POST /sessions/:id/terminate`, `GET/PUT /settings`, `GET /audit-logs`, `GET /login-history`.

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
`POST /redeem` (S, access code) · `POST /courses/:id/enroll` (S, public courses) · `GET /mine` (S) · `POST /courses/:id/favorite` (S) · `POST /courses/:id/lessons/:lid/complete` (S) · `GET /certificates/mine` (S) · `GET /certificates/verify/:serial` (**public**) · codes & roster (owner/AD): `POST/GET /courses/:id/codes`, `POST /courses/:id/codes/:codeId/revoke`, `GET/POST /courses/:id/students`, `DELETE /courses/:id/students/:sid`, `POST /courses/:id/students/:sid/expire`.

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
Attempts: `POST /courses/:id/:quizId/start` (S) · `POST /attempts/:aid/answers` (S autosave) · `POST /attempts/:aid/submit` (S) · `GET /attempts/mine` (S) · `GET /attempts/:aid` (owner of attempt or staff) · `POST /attempts/:aid/grade` (T/AD manual grading) · `POST /attempts/:aid/invalidate` (T/AD).
Insights: `GET /courses/:id/:quizId/attempts|stats` (owner/AD) · `GET .../leaderboard` (A, if enabled) · `POST .../remind` (owner/AD).

## Assignments — `/assignments`
`POST/GET /courses/:id` · `PUT/DELETE /courses/:id/:aid` (owner/AD) · `POST /courses/:id/:aid/submit` (S) · `GET /courses/:id/:aid/submissions` (owner/AD) · `POST /submissions/:sid/grade` (T/AD).

## Files — `/files`
`POST /courses/:id/documents|images` (owner/AD) · `POST /global` (AD) + `GET /global` (A) · `POST /submissions` (S) · `POST /avatar` (A) · `GET /courses/:id` (course access) · `GET /:fileId/content` (scope-checked serving) · `DELETE /:fileId` (uploader/AD).

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
