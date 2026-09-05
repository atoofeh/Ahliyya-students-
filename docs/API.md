# API Reference (v1)

Base URL: `/api/v1`. All endpoints return JSON. Authenticated endpoints require `Authorization: Bearer <accessToken>` plus an `x-device-id` header that must match the device the session was created from (optional `x-fingerprint`, `x-client-platform`, `x-app-version`). Errors use `{ message, code?, errors? }`.

Roles: **P** public · **A** any authenticated · **S** student · **T** teacher (course owner where course-scoped) · **AD** admin · **O** owner (`super_admin`). Course-scoped teacher routes also allow admins; admin routes admit the owner.

## Auth — `/auth`
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/login` | P | `{username, password, deviceId, fingerprint?, rememberMe?}` → `{user, accessToken}` + httpOnly refresh cookie (body also includes `refreshToken` when `x-client-platform` is `android`/`ios`). `403 DEVICE_NOT_AUTHORIZED` from a second device. Ends other sessions (multi-device roles excepted). With `rememberMe` the session is exempt from the idle timeout and its refresh token lasts a year, rotating on every use, so it does not expire on a clock; without it the cookie is a browser-session cookie and the ordinary inactivity timeout applies. |
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
| GET | `/catalog` | A — published courses with `visibility: 'listed'`; each item carries `freeLessonCount` |
| GET | `/mine` | T/AD — courses created **or co-taught** |
| POST | `/` | T/AD |
| GET | `/:courseId` | enrolled S / course staff / AD — returns course + curriculum + progress |
| GET | `/:courseId/preview` | A — listed + published only: course card, `lessonCount`, `freeLessons[]`, `enrolled` |
| PUT/DELETE | `/:courseId` | course staff/AD |
| POST/PUT/DELETE | `/:courseId/sections[/:sectionId]` | course staff/AD |
| POST/PUT/DELETE | `/:courseId/lessons[/:lessonId]` | course staff/AD |
| GET | `/:courseId/lessons/:lessonId` | enrolled S / course staff / AD — **plus any authenticated user when the lesson is `isFree` on a listed, published course**; a preview viewer gets no progress record |
| POST | `/:courseId/reorder` | course staff/AD |

Course `visibility` is `listed` (shown in the catalog; free lessons open to anyone signed in) or `hidden` (invisible unless enrolled). The old `public` value and open self-enrolment are gone — enrolment is by access code or staff assignment. Migration `005` maps `public → listed`, `private → hidden`.

## Co-teaching — `/co-teaching`
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/courses/:courseId` | course staff/AD | `{owner, coTeachers[], pendingInvites[], canManage}` |
| POST | `/courses/:courseId/invite` | course staff/AD | `{teacher: username\|email, message?}` → `201`. `400 TEACHER_NOT_FOUND` (identical for a missing, suspended or non-teacher account), `400 ALREADY_CO_TEACHER`, `409 INVITE_EXISTS`. 20/h per account. |
| POST | `/courses/:courseId/invites/:inviteId/cancel` | course staff/AD | withdraw an unanswered invitation |
| DELETE | `/courses/:courseId/teachers/:teacherId` | **course creator** or AD | `403 NOT_COURSE_CREATOR` for a co-teacher, `400 CANNOT_REMOVE_CREATOR` |
| GET | `/invitations` | A | invitations addressed to the caller |
| POST | `/invitations/:inviteId/accept` | invitee (T) | joins `Course.coTeachers`; `403 NOT_A_TEACHER` if the account was demoted |
| POST | `/invitations/:inviteId/decline` | invitee | |

An accepted co-teacher has the creator's authority everywhere a course is checked — content, roster, grading, Q&A moderation — because every check goes through `modules/courses/courseStaff`. Only the creator (or an admin) can change the teaching staff.

## Enrollments — `/enrollments`
`POST /redeem` (S, access code) · `GET /mine` (S) · `POST /courses/:id/favorite` (S) · `POST /courses/:id/lessons/:lid/complete` (S) · `GET /certificates/mine` (S) · `GET /certificates/verify/:serial` (**public**) · codes (AD/O only): `POST/GET /courses/:id/codes`, `POST /courses/:id/codes/:codeId/revoke` · roster (course staff/AD/O): `GET /courses/:id/students`, `DELETE /courses/:id/students/:sid` (a teacher may remove any student from a course they run), `POST /courses/:id/students/:sid/expire` · direct assignment (AD/O only): `POST /courses/:id/students`.

### Packages and payments

Every enrollment carries a **package** — `mid`, `final` or `full` — and what the student paid.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/courses/:id/students` | AD/O (`enrollments.manage`) | `{student, package?, amountPaid?, paymentNote?}`. Defaults to `full` and `0`. The enrollment copies the course's `currency` so a later change to the course cannot re-denominate it. |
| POST | `/courses/:id/codes` | AD/O (`access_codes.manage`) | also takes `{package?, amountPaid?}` — a redeemed code carries them onto the enrollment it creates, so students who join by code are not missing from the figures |
| PATCH | `/courses/:id/students/:sid/payment` | **AD/O only** (`payments.manage`) | `{package?, amountPaid?, paymentNote?}` — corrections; audited as `ENROLLMENT_PAYMENT_RECORDED` with the before and after values |
| GET | `/courses/:id/revenue` | **AD/O only** (`payments.manage`) | `{course:{currency}, totals:{students, collected, average, unrecorded}, byPackage[], monthly[]}`. Removed students still count towards `collected` — the money was taken — but not towards `students`. |

`GET /courses/:id/students` returns `package` to everyone who may see the roster, and `amountPaid`, `currency`, `paymentNote`, `paymentRecordedBy` and `paymentRecordedAt` **only** to a caller holding `payments.manage`. For anyone else those fields are excluded from the query, so a teacher's client is never sent them. `GET /mine` never returns them at all.

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
- **Q&A** `/qa` (moderated): `POST /courses/:id` — a student's question is created `pending` and notifies **every** teacher on the course; 20/15 min per account. A question posted by course staff is `approved` immediately. `GET /courses/:id?status=pending|approved|rejected` — staff see everything and a `pendingCount`; students see approved questions plus their own whatever its state. `POST /:threadId/approve` and `POST /:threadId/reject {reason?}` (course staff only; the author is notified either way). `POST /:threadId/replies` — staff replying to a pending question approves it in the same step; a student needs a **live enrollment** (being the author is not enough) and the thread must be `approved`, else `403 QA_NOT_APPROVED`. `POST /:threadId/resolve` (staff, or the enrolled author).
- **Bookmarks** `/bookmarks`: `POST /`, `GET /`, `DELETE /:id` (S).
- **Health**: `GET /api/health` (public).
