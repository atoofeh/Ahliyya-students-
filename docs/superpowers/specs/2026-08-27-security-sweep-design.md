# Security Sweep + Security Center — Design

**Date:** 2026-08-27
**Status:** Approved (design), pending spec review
**Builds on:** `identity-access-v1` (four roles, owner protections, device binding, cookie-only refresh).
**Scope:** Sub-projects 4 and 5 of the hardening mission: server-side hardening with adversarial test files, and the owner's Security Center + Admins page with a reorganised admin navigation.

Out of scope (later stages): the study-UI redesign and design-system normalisation, cross-course Enrollments / Access Codes pages, Android.

---

## 1. Findings driving this stage

| # | Finding | Where |
|---|---|---|
| F1 | Request logger writes `originalUrl` verbatim — `GET /videos/:id/stream?token=…` puts live stream tokens in `combined.log`. | `app.js:20` |
| F2 | Mailer logs the first 200 chars of every message whenever `SMTP_HOST` is unset — in production that is verification and reset codes. | `core/mailer.js:29` |
| F3 | Assignment-reminder dedupe is an in-memory `Set`; restarts re-send, a second instance double-sends. | `jobs/index.js:47` |
| F4 | Login limiter is per-IP only (10 / 15 min): ten wrong passwords from a lecture hall block the whole NAT. | `middleware/rateLimiters.js` |
| F5 | No limiter on quiz autosave/submit; autosave has no stale-write protection (a slow earlier request can overwrite newer answers). | `quizzes.routes.js`, `QuizService.saveAnswers` |
| F6 | Upload validation: extension + magic bytes for documents/images, heuristic executable check; no MIME allowlist; assembled videos are never sniffed; heuristic is called a "malware scan". | `middleware/uploads.js`, `videos.service.js` |
| F7 | Production allows identical `JWT_SECRET` / `JWT_REFRESH_SECRET` / `MEDIA_MASTER_KEY`; there is no way to rotate the media key without stranding stored video. | `config/env.js`, `core/cryptoUtils.js` |
| F8 | XSS: no `dangerouslySetInnerHTML`; lesson content, announcements, Q&A and feedback render as text through React. **No change needed** — documented as reviewed. | client |
| F9 | No adversarial tests for NoSQL injection, IDOR across secondary resources, rate limits. | `tests/` |

## 2. Decisions

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| 1 | Login limiting | Two buckets: per-IP 30 / 15 min **and** per-username 10 / 15 min (key = lower-cased `req.body.username`, falls back to IP when absent) + existing per-account lockout | Single per-IP 10 / 15 min (NAT lockout); CAPTCHA (dependency, UX) |
| 2 | Malware scanning | Optional ClamAV daemon over TCP INSTREAM (`CLAMAV_HOST`, `CLAMAV_PORT` default 3310, `CLAMAV_TIMEOUT_MS` default 15000), **fail-closed** when configured but unreachable; heuristic stays as first pass; docs stop calling it antivirus | Cloud scanning API (third-party upload of student work); heuristic only |
| 3 | Security Center scope | Owner-only `/admin/security` (Overview, Devices, Reset requests, Policies) + `/admin/admins`; Users page gains Students / Teachers / Admins tabs; nav reorganised; Sessions / Audit / Login history reused | Admins page only; full Phase 37 nav with cross-course Enrollments/Codes pages |
| 4 | Device-reset requests | Public `POST /auth/device/reset-request { username, note? }`: always `202`, never reveals whether the account exists, rate-limited 3 / hour per IP **and** 3 / day per username, stored as `DeviceResetRequest` for admins | No self-service path (the login message already tells the student to ask an administrator) |
| 5 | Media key rotation | `MEDIA_KEY_VERSION` (int, default 1) + `MEDIA_MASTER_KEY_PREVIOUS` (optional). New videos wrap with the current key and record `encryption.keyVersion`; unwrap picks current or previous by version. Rotation = set PREVIOUS to the old key, bump VERSION, deploy; a `rewrap-media-keys` migration re-wraps every stored key so PREVIOUS can be removed | Deriving media key from JWT secret (current dev fallback stays dev-only); no versioning |

## 3. Server hardening

### 3.1 Logging (F1, F2)
- `app.js` request log: URL is passed through `redactUrl()` which replaces the value of `token`, `code`, `refreshToken` query parameters with `[redacted]`.
- `core/mailer.js`: the `[dev mail]` preview log runs only when `env.NODE_ENV !== 'production'`. In production with `SMTP_HOST` unset, boot logs one `warn`: *SMTP is not configured — verification and reset emails cannot be delivered.* (Startup is not blocked: an institution may run with `requireEmailVerification=false`.)
- `middleware/errorHandler.js`: unchanged — stacks already hidden in production.

### 3.2 Rate limits (F4, F5)
`middleware/rateLimiters.js`:
- `loginIpLimiter`: 30 / 15 min per IP. `loginAccountLimiter`: 10 / 15 min, `keyGenerator: (req) => 'u:' + String(req.body?.username || req.ip).toLowerCase()`. Both on `POST /auth/login`, in that order.
- `refreshLimiter`: 60 / 15 min per IP on `POST /auth/refresh`.
- `quizWriteLimiter`: 120 / min per IP on `/quizzes/attempts/:id/answers` and `/submit` (autosave every 15 s plus retries fits comfortably).
- `resetRequestIpLimiter`: 3 / hour per IP; `resetRequestAccountLimiter`: 3 / day keyed on username — on `POST /auth/device/reset-request`.
- `TEST_MULTIPLIER` becomes `RATE_LIMIT_MULTIPLIER` from env (`z.coerce.number().min(1).default(1)`), and the harness sets `100`; the rate-limit test file sets `1` before requiring the harness.

### 3.3 Quiz autosave hardening (F5)
- `saveAnswersSchema` gains `clientSavedAt: z.coerce.date().optional()`.
- `QuizAttempt` gains `answersSavedAt: Date|null`.
- `QuizService.saveAnswers`: if `clientSavedAt` is present and `attempt.answersSavedAt` is newer, respond `200 { saved: false, stale: true, savedAt }` without writing; otherwise write and set `answersSavedAt = clientSavedAt || now`. Submit always wins (it carries the final answers).
- `QuizRunner.jsx`: each autosave sends `clientSavedAt: new Date().toISOString()` captured when the payload is built; a `stale: true` reply is ignored (a newer save already landed).

### 3.4 Uploads (F6)
`middleware/uploads.js`:
- MIME allowlist per kind (`documents`: pdf, msword, openxml docx/pptx/xlsx, vnd.ms-powerpoint/excel, zip, text/plain; `images`: png, jpeg, webp, gif, svg+xml) checked in `persistUpload` alongside the extension; mismatch → `400 BAD_FILE_TYPE`.
- SVG uploads are rejected for avatars and question images (script-bearing) — `.svg` stays allowed only for course thumbnails, and is served with `Content-Disposition: attachment` (never inline).
- `scanBuffer()` becomes: heuristic pass → if `env.CLAMAV_HOST` set, `clamav.scan(buffer)` (new `core/clamav.js`: TCP socket, `zINSTREAM\0`, 64 KB chunks, parse `stream: OK` / `FOUND`); daemon error → `{ clean: false, threat: 'scanner_unavailable' }` → `503 SCANNER_UNAVAILABLE` (fail closed). Unit-tested with a fake clamd server in the test.
- `videos.service.#processUpload`: after assembly, read the first 32 bytes; accept if `ftyp` at offset 4 (mp4/mov/m4v) or `1A 45 DF A3` at 0 (webm/mkv); otherwise mark the video `failed` with `processingError: 'Not a recognised video container'` and delete the assembled file.

### 3.5 Secrets and media-key versioning (F7)
`config/env.js`:
- Production refuses to start if any two of `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MEDIA_MASTER_KEY` are equal, or if `MEDIA_MASTER_KEY` equals `MEDIA_MASTER_KEY_PREVIOUS`.
- New: `MEDIA_KEY_VERSION` (int ≥ 1, default 1), `MEDIA_MASTER_KEY_PREVIOUS` (optional, min 32), `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_TIMEOUT_MS`, `RATE_LIMIT_MULTIPLIER`.
`core/cryptoUtils.js`: `wrapKey(key) → { wrapped, keyVersion }`; `unwrapKey(wrapped, keyVersion)` selects the master key by version (current or previous) and throws `MEDIA_KEY_UNAVAILABLE` for unknown versions. `Video.encryption.keyVersion` (default 1). `videos.service` passes the version on wrap/unwrap. Migration `002-rewrap-media-keys` re-wraps every ready video's key from PREVIOUS to current (`--dry-run` counts them).

### 3.6 Jobs (F3)
`Assignment.reminderSentAt: Date|null`; the reminder job selects `reminderSentAt: null` and sets it atomically with `findOneAndUpdate` before notifying, so two instances cannot both send.

### 3.7 Device-reset requests (decision 4)
- Model `DeviceResetRequest { username, user: ObjectId|null (resolved server-side, never returned to the requester), note (≤300), ip, userAgent, status: 'open'|'resolved'|'dismissed', resolvedBy, resolvedAt, resolution }`. Index `{ status: 1, createdAt: -1 }`.
- `POST /auth/device/reset-request` (public, limited) → `202 { message: 'If the account exists, an administrator will review the request.' }`. Audit `DEVICE_RESET_REQUESTED` (no user id when the account is unknown; `meta.username` only).
- `GET /admin/device-requests?status=` (`devices.view`), `POST /admin/device-requests/:id/resolve { action: 'revoke'|'dismiss', resolution }` (`devices.reset`): `revoke` calls `DeviceService.revoke` (through `assertCanManage`, so owner-targeted requests are blocked for admins) and marks resolved.
- `LoginPage` device-blocked banner gains a "Request a device reset" link that opens a small form (username prefilled, optional note).

### 3.8 Security Center data
- `GET /admin/security/overview` (`audit.view`): `{ activeSessions, failedLogins24h, lockedAccounts, deviceResets7d, openResetRequests, suspiciousEvents7d: [{ action, count }] (DEVICE_LOGIN_REJECTED, DEVICE_MISMATCH, TOKEN_REUSE_DETECTED, OWNER_ACTION_BLOCKED, ACCOUNT_LOCKED), recentSecurityAudit: last 20 rows of those actions }`.
- `GET /admin/devices?search=&status=` (`devices.view`): paginated `Device` rows joined with `user` (name, username, role); `POST /admin/users/:id/device/revoke` (exists) is reused.
- Admin listing: `GET /admin/users?role=admin` (exists). Admin creation, suspension and device reset reuse existing routes; the owner-only rules already live in `assertCanManage`.

## 4. Client

- **Navigation** (`MainLayout`): admin nav becomes Overview, Users, Courses, Sessions, Cheat Reports, Announcements, Audit, Settings; the owner additionally gets **Security** (`/admin/security`) and **Admins** (`/admin/admins`). Nav entries come from a single `ADMIN_NAV` + `OWNER_NAV` list in `utils/roles.js`.
- **AdminUsers**: role tabs (All / Students / Teachers / Admins — the Admins tab only for the owner) driving the existing `role` filter.
- **AdminAdmins** (`/admin/admins`, owner-only route): list admins with status, last login, device public id; create admin (reuses the create modal), suspend/activate, reset password, revoke device, force logout — all via existing routes.
- **AdminSecurity** (`/admin/security`, owner-only): tabs Overview / Devices / Reset requests / Policies. Overview renders the tiles and the recent security audit list; Devices is a searchable table with revoke; Reset requests lists open requests with Revoke / Dismiss; Policies edits only the five owner-only settings (same `PUT /admin/settings`).
- **Protected routes**: `/admin/security` and `/admin/admins` use `roles={['super_admin']}` (no `admin` in the list, so `roleMatches` does not admit admins).
- **QuizRunner**: `clientSavedAt` on autosave (§3.3).
- **LoginPage**: reset-request form (§3.7).

## 5. Tests (`node:test`, harness)

- **ratelimit.test.js** — sets `RATE_LIMIT_MULTIPLIER=1` before the harness: 31st login from one IP → 429; 11th login for one username from rotating `X-Forwarded-For` values → 429 (trust proxy is 1, so the header is honoured) while another username from the same IPs still passes; 4th reset request in an hour → 429; quiz autosave 121st/min → 429.
- **injection.test.js** — `{ username: { $ne: null }, password: … }` → 400 (Zod); `{ username: 'admin', password: { $gt: '' } }` → 400; audit-log `action` filter with `$where` → 400/no match; nested `$` keys and dotted keys in a course update body are stripped (course unchanged); array-for-string type confusion on `search` → 400; `userId` param `{"$gt":""}` → 400 INVALID_ID.
- **idor.test.js** — two students, two teachers, two courses: file content of another course → 403; another student's submission file → 403; `GET /quizzes/attempts/:foreign` → 403; `POST /assignments/submissions/:foreign/grade` by non-owner teacher → 403; `DELETE /bookmarks/:foreign` → 404; `POST /qa/:foreignThread/replies` when not enrolled → 403; `DELETE /files/:foreign` by non-uploader teacher → 403; `POST /videos/:foreign/token` → 403; `GET /enrollments/courses/:foreign/students` → 403.
- **uploads.test.js** — document with wrong extension/MIME → 400; PNG bytes named `.pdf` → 400; `.exe` renamed `.pdf` (MZ header) → 400 MALWARE_SUSPECTED; SVG avatar → 400; with a fake clamd on a local port: EICAR-style `FOUND` reply → 400, `OK` → 201, daemon down while configured → 503; assembled "video" that is not a container → status `failed`.
- **quiz-autosave.test.js** — two saves with out-of-order `clientSavedAt`: the older one returns `stale: true` and the newer answers survive; submit after a stale save still grades the submitted answers.
- **security-center.test.js** — reset request always 202 for known and unknown usernames with identical bodies; request appears for the owner; resolve → revoke ends the student's sessions; admin cannot resolve a request that targets the owner; overview counts move after a failed login and a lockout; devices list is paginated and hides hashes; admin (non-owner) gets 403 on nothing here except owner-targeted revoke (permissions are `devices.*`/`audit.view`, both admin-level).
- **media-keys.test.js** — wrap with version 1, rotate env to version 2 with PREVIOUS set, unwrap still works, migration `002` re-wraps, unwrap works with PREVIOUS removed; production secret-equality refusal (unit: run `env` validation in a child process with equal secrets → exit 1).
- **jobs.test.js** — reminder job run twice sends once; two concurrent runs send once.
- Existing files stay green; smoke gains nothing.

Definition of done: both lints unchanged-or-better, `npm test` green with the seven new files, client builds, `docs/SECURITY.md` / `API.md` / `README` / `CLAUDE.md` updated (uploads section stops saying "malware scan", documents ClamAV, key rotation, rate buckets, reset requests, Security Center).
