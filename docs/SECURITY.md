# Security Model

This document describes what the platform protects, how, and — critically — what **cannot** be fully protected inside a web browser. We implement the strongest technically feasible controls and disclose the rest honestly instead of claiming impossible security.

## Authentication & sessions

- **Passwords**: bcrypt (cost 12), strength rules enforced server-side (8+ chars, upper/lower/digit). Reset/verification codes are stored as SHA-256 hashes with 15-minute expiry; responses never reveal whether an email exists.
- **Tokens**: short-lived access JWT (15 min) + rotating refresh token. Every token embeds a **session id**; the session document must still be active for the token to work. Refresh tokens are single-use — replaying a rotated token kills the session (theft detection). Refresh tokens travel in an httpOnly cookie scoped to `/api/v1/auth`.
- **Single active session**: a new login deactivates all other sessions for the account. The evicted device receives `SESSION_TERMINATED` on its next request (worst case within the access-token lifetime for pure reads, immediately for anything touching the API) and is shown a clear explanation.
- **Brute force**: per-IP rate limits on credential endpoints + per-account lockout after N failures (admin-configurable count and duration). All attempts land in immutable `LoginHistory`.
- **Inactivity timeout**: `Session.lastActivityAt` is tracked (throttled writes); requests beyond the admin-configured idle window end the session. A background sweep closes sessions from vanished clients.
- **Global revocation**: `tokenVersion` on the user invalidates every outstanding token (used on password change/reset, role change, suspension, ban, delete, admin force-logout).

## Authorization

- Role middleware (`admin` / `teacher` / `student`) plus **resource-level** checks: course-scoped routes verify ownership (teacher) or active, unexpired enrollment (student) on every request — never trust the client.
- Quiz answer keys are `select: false` at the schema level; student-facing queries physically cannot include `isCorrect`, `correctAnswers`, or `explanation` unless a grading path opts in. Attempts snapshot questions at start, so editing a question never leaks into or corrupts a running attempt.
- Suspended/banned accounts fail authentication before any handler runs. Maintenance mode blocks all non-admin traffic at the same choke point.

## Injection & transport hardening

- **NoSQL injection**: all input passes Zod validation; `$`-prefixed and dotted keys are stripped from bodies recursively; queries use parameterized Mongoose APIs only.
- **XSS**: React escapes output by default; no `dangerouslySetInnerHTML` anywhere; helmet CSP restricts scripts to self; API responses are JSON with `nosniff`.
- **CSRF**: the API is JWT-in-header (not cookie) for state-changing calls, so cross-site form posts fail; the refresh cookie is `SameSite=Lax` and scoped to the refresh path; CORS is locked to the configured client origin with an explicit header allowlist.
- **Other**: hpp (parameter pollution), rate limiting on all API traffic with stricter buckets for auth/uploads/search, security headers via helmet, `trust proxy` + secure cookies for HTTPS deployments.

## File & video protection

- Uploads are validated three ways: extension allowlist, **magic-byte** content check, and a heuristic malware scan (rejects PE/ELF executables and script types). `scanBuffer()` is the seam for a real AV engine. Stored names are UUIDs; originals are metadata only. Nothing under `storage/` is ever statically served — every byte flows through an authorization check.
- Videos are encrypted at rest with **AES-256-CTR** using a random per-video key, wrapped (AES-256-GCM) by the platform master key. CTR mode gives random access, so HTTP Range requests decrypt mid-file without ever materializing a plaintext copy.
- Streaming requires a **signed token** (HMAC over resource + user + session + expiry, 5-minute TTL) *and* the bound session must still be active — a terminated or expired session cannot keep a stream alive. Players renew tokens transparently.

## Anti-cheat proctoring — capabilities and limits

Detected and reported (batched, server-side weighted risk score, optional auto-submit): tab/window switching, devtools (window-size heuristics + blocked shortcuts), copy/cut/paste, right-click, PrintScreen keypress (clipboard is overwritten best-effort), page refresh/unload, network loss, the same attempt open in multiple tabs (BroadcastChannel), fullscreen exit, and mouse/keyboard inactivity. Strictness multipliers and violation thresholds are configurable per quiz and platform-wide.

**Honest limits.** All of this runs in the student's browser and is a *deterrent and evidence trail*, not a guarantee:

- A second physical device (phone camera, another laptop) is invisible to any web page.
- Detection code can in principle be disabled by a technically skilled user; that is why the *server* computes risk scores from received events, flags gaps (e.g., refresh storms, zero mouse activity), and surfaces everything to instructors for human judgment rather than making silent automated accusations.
- Multiple-monitor detection is not reliably possible from JavaScript; we approximate with focus/blur signals.
- Virtual machines cannot be reliably detected from a browser; fingerprint mismatch events are recorded as a weak signal.

## Screen recording & screenshots — what browsers actually allow

We implement every feasible deterrent:

- Dynamic **moving watermark** on all video (student name + ID + timestamp, optionally IP) — leaked footage identifies its source. This is the industry-standard control and the single most effective one.
- Playback pauses when the tab is hidden; download, remote playback, and picture-in-picture are disabled; context menu blocked; stream URLs expire in minutes and are session-bound.
- PrintScreen and known screenshot/devtools shortcuts are intercepted **during quizzes**, with clipboard overwrite as a best effort.

**What no website can do**, and what we therefore do not claim: prevent OS-level recorders (OBS, Xbox Game Bar, macOS capture), hardware capture cards, or a phone pointed at the screen. Browser DRM (EME/Widevine L1) can raise the bar further but requires licensing a DRM provider and still does not stop camera capture. The platform's protection model is *identification and deterrence* (watermarks + audit trail + short-lived, per-user streams), which remains effective even when capture technically succeeds.

## Auditability

Every security-relevant event (60+ action types) is written to MongoDB (`AuditLog`, immutable by convention — no update/delete endpoints exist) and mirrored to `server/logs/security.log`. Login history keeps device, browser, OS, IP, and fingerprint per attempt. Cheat events keep a per-attempt timeline that instructors can review before invalidating an attempt.
