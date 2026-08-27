# Security Model

This document describes what the platform protects, how, and — critically — what **cannot** be fully protected inside a web browser. We implement the strongest technically feasible controls and disclose the rest honestly instead of claiming impossible security.

## Authentication & sessions

- **Accounts** are created only by administrators; there is no public registration. New accounts carry `mustChangePassword` and are confined to the onboarding endpoints (`/auth/verify-email`, `/auth/set-password`, `/auth/me`, `/auth/refresh`, `/auth/logout`, `/auth/resend-verification`) until they set a password.
- **Passwords**: bcrypt (cost 12), strength rules enforced server-side (8+ chars, upper/lower/digit). Reset/verification codes are stored as SHA-256 hashes with 15-minute expiry.
- **Enumeration-safe login**: the password is checked first (an unknown username still runs a bcrypt compare so timing matches). A wrong password always returns *Invalid username or password*. Lockout, suspension and ban are only disclosed once the password was correct. All attempts land in immutable `LoginHistory`.
- **Tokens**: short-lived access JWT (15 min) + rotating refresh token carrying a random `jti`. Every token embeds a **session id**; the session document must still be active for the token to work. Refresh tokens are single-use — replaying a rotated token ends the session (`TOKEN_REUSE_DETECTED`).
- **Refresh-token storage**: the web client keeps the access token **in memory only** and never sees the refresh token — it travels solely in an `httpOnly` cookie scoped to `/api/v1/auth` (`SameSite` per `REFRESH_COOKIE_SAMESITE`, `Secure` in production). Nothing token-related is written to `localStorage`. Native clients that declare `x-client-platform: android|ios` additionally receive the refresh token in the response body for Keystore-backed storage; the server ignores a body refresh token from any other client.
- **CSRF**: `/auth/refresh` and `/auth/logout` reject any request whose `Origin` header is present and not in `CLIENT_URL` + `ALLOWED_ORIGINS`. Other state-changing calls are JWT-in-header, which cross-site forms cannot produce.
- **Single active session**: a new login ends every other session for the account. The evicted device receives `SESSION_TERMINATED` on its next request and sees "Your session has ended".
- **Brute force**: per-IP rate limits on credential endpoints + per-account lockout after N failures (owner-configurable count and duration).
- **Inactivity timeout**: `Session.lastActivityAt` is tracked (throttled writes); requests beyond the owner-configured idle window end the session. A background sweep closes sessions from vanished clients.
- **Global revocation**: `tokenVersion` on the user invalidates every outstanding token (password change/reset, role change, suspension, ban, delete, force-logout, device revocation).

## One account, one authorized device

Every account is bound to a single authorized device.

- **Binding.** On the first successful login (after the password check) the server records a `Device` for the account: the SHA-256 of the client's random device id, a browser/OS fingerprint hash as a supporting signal, platform, and first/last-seen timestamps. The `Device` collection has a **partial unique index** on `{ user }` where `status: 'active'`, so the database — not application code — guarantees at most one active device; two simultaneous first logins result in exactly one binding.
- **Same device** logs in normally; last-seen, IP and fingerprint are refreshed. Fingerprint drift (browser updates) is logged (`DEVICE_FINGERPRINT_DRIFT`), never enforced.
- **Different device** is refused with `403 DEVICE_NOT_AUTHORIZED` — *This account is already linked to another device. Contact an administrator or request a device reset.* — and audited (`DEVICE_LOGIN_REJECTED`). The trusted device is unaffected. A wrong password from any device gets the generic credential message; device state is never disclosed before the password is verified.
- **Session pinning.** Every session stores the hash of the device that created it. Each authenticated request and every refresh must present the matching `x-device-id`; a mismatch ends the session (`DEVICE_MISMATCH` audit, `401 SESSION_TERMINATED`). A stolen token without the device id is useless.
- **Revocation.** An administrator (`devices.reset`) revokes a device with a reason: all sessions end, `tokenVersion` is bumped, `DEVICE_REVOKED` is audited, and the next login from any device binds fresh (`DEVICE_CHANGED`). A user may also "forget this device" on logout. Admins cannot reset the owner's device; only the owner can reset an admin's.
- **Policy switch.** `deviceBindingEnabled` (owner-only) turns the one-device rule off platform-wide; session pinning stays on.
- **Honest limit.** On the web, the device id lives in the browser's storage. Someone with both the password *and* a copy of that storage can sign in as the user; the design forces an attacker to obtain two secrets instead of one and makes every attempt visible in the audit log. Hardware-bound identity (WebAuthn/attestation) is the next step and is out of scope here. On Android the id is kept in Keystore-backed storage.

## Authorization

- Four roles: `super_admin` (owner), `admin`, `teacher`, `student`. A central permission map (`src/core/permissions.js`) drives `requirePermission()`; teacher/course routes additionally enforce ownership (`courseAccess`). The owner is created only by the bootstrap seed — no API accepts `role: 'super_admin'`. Admins cannot create or mutate other admins, cannot touch the owner (`OWNER_PROTECTED`, audited as `OWNER_ACTION_BLOCKED`), cannot act on their own account through admin routes (`SELF_ACTION`), and cannot change owner-only settings (`sessionTimeoutMinutes`, `maxLoginAttempts`, `lockoutMinutes`, `requireEmailVerification`, `deviceBindingEnabled`).
- Course-scoped routes verify ownership (teacher) or active, unexpired enrollment (student) on every request — never trust the client.
- Quiz answer keys are `select: false` at the schema level; student-facing queries physically cannot include `isCorrect`, `correctAnswers`, or `explanation` unless a grading path opts in. Attempts snapshot questions at start, so editing a question never leaks into or corrupts a running attempt.
- Suspended/banned accounts fail authentication before any handler runs. Maintenance mode blocks all non-admin traffic at the same choke point.

## Injection & transport hardening

- **NoSQL injection**: all input passes Zod validation; `$`-prefixed and dotted keys are stripped from bodies recursively; queries use parameterized Mongoose APIs only.
- **XSS**: React escapes output by default; no `dangerouslySetInnerHTML` anywhere; helmet CSP restricts scripts to self; API responses are JSON with `nosniff`.
- **CSRF**: the API is JWT-in-header (not cookie) for state-changing calls, so cross-site form posts fail; the refresh cookie is path-scoped and `SameSite` per configuration, and the cookie-bearing routes check `Origin`; CORS is locked to `CLIENT_URL` + `ALLOWED_ORIGINS` with an explicit header allowlist.
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

Every security-relevant event (70+ action types, including device binding, rejection, revocation, owner-protection blocks and security-setting changes) is written to MongoDB (`AuditLog`, immutable by convention — no update/delete endpoints exist) and mirrored to `server/logs/security.log`. Login history keeps device, browser, OS, IP, and fingerprint per attempt. Cheat events keep a per-attempt timeline that instructors can review before invalidating an attempt.
