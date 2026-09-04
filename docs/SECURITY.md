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
- **Brute force**: two login buckets — 30 attempts / 15 min per IP (a lecture hall shares one NAT) and 10 / 15 min per **username** across any IPs — plus per-account lockout after N failures (owner-configurable count and duration). Further buckets: refresh 60 / 15 min, quiz autosave and submit 120 / min, password and verification endpoints, device-reset requests 3 / hour per IP and 3 / day per account.
- **Inactivity timeout**: `Session.lastActivityAt` is tracked (throttled writes); requests beyond the owner-configured idle window end the session. A background sweep closes sessions from vanished clients.
- **Global revocation**: `tokenVersion` on the user invalidates every outstanding token (password change/reset, role change, suspension, ban, delete, force-logout, device revocation).

## One student, one authorized device

Every **student** account is bound to a single authorized device. Teachers,
administrators and the owner may be signed in on several devices at once: they
move between a classroom machine, an office laptop and a phone in a normal
working day, and the rule exists to stop a shared student login, not to make
staff work impossible. The distinction lives in one place —
`isMultiDeviceRole()` in `src/core/permissions.js` — and an individual account
can also be granted it with `allowMultipleDevices`.

Everything below applies to single-device accounts; **session pinning applies to
everyone**, staff included, so a stolen staff token is still useless without the
device id it was issued to.

- **Binding.** On the first successful login (after the password check) the server records a `Device` for the account: the SHA-256 of the client's random device id, a browser/OS fingerprint hash as a supporting signal, platform, and first/last-seen timestamps. The `Device` collection has a **partial unique index** on `{ user }` where `status: 'active'`, so the database — not application code — guarantees at most one active device; two simultaneous first logins result in exactly one binding.
- **Same device** logs in normally; last-seen, IP and fingerprint are refreshed. Fingerprint drift (browser updates) is logged (`DEVICE_FINGERPRINT_DRIFT`), never enforced.
- **Different device** is refused with `403 DEVICE_NOT_AUTHORIZED` — *This account is already linked to another device. Contact an administrator or request a device reset.* — and audited (`DEVICE_LOGIN_REJECTED`). The trusted device is unaffected. A wrong password from any device gets the generic credential message; device state is never disclosed before the password is verified.
- **Session pinning.** Every session stores the hash of the device that created it. Each authenticated request and every refresh must present the matching `x-device-id`; a mismatch ends the session (`DEVICE_MISMATCH` audit, `401 SESSION_TERMINATED`). A stolen token without the device id is useless.
- **Revocation.** An administrator (`devices.reset`) revokes a device with a reason: all sessions end, `tokenVersion` is bumped, `DEVICE_REVOKED` is audited, and the next login from any device binds fresh (`DEVICE_CHANGED`). A user may also "forget this device" on logout. Admins cannot reset the owner's device; only the owner can reset an admin's.
- **Lost device.** A student who is blocked can submit a public *device-reset request* (`POST /auth/device/reset-request`): the reply is identical whether or not the account exists, the endpoint is rate-limited (3 / hour per IP, 3 / day per account), only requests for real accounts are stored, and administrators approve (revoke) or dismiss them in the Security Center — approval goes through the same owner-protection guard as a direct revoke.
- **Policy switch.** `deviceBindingEnabled` (owner-only) turns the one-device rule off platform-wide; session pinning stays on.
- **Honest limit.** On the web, the device id lives in the browser's storage. Someone with both the password *and* a copy of that storage can sign in as the user; the design forces an attacker to obtain two secrets instead of one and makes every attempt visible in the audit log. Hardware-bound identity (WebAuthn/attestation) is the next step and is out of scope here.
- **On Android** the device id is not stored at all: it is the SHA-256 of `Settings.Secure.ANDROID_ID`, computed inside the native plugin, so the raw platform id never crosses the JavaScript bridge or the network. It is derived rather than generated so that **reinstalling the app keeps the same binding** — otherwise every reinstall would lock the student out until an administrator reset them. A factory reset changes it, and does require a reset request.

## Authorization

- Four roles: `super_admin` (owner), `admin`, `teacher`, `student`. A central permission map (`src/core/permissions.js`) drives `requirePermission()`; teacher/course routes additionally enforce ownership (`courseAccess`). The owner is created only by the bootstrap seed — no API accepts `role: 'super_admin'`. Admins cannot create or mutate other admins, cannot touch the owner (`OWNER_PROTECTED`, audited as `OWNER_ACTION_BLOCKED`), cannot act on their own account through admin routes (`SELF_ACTION`), and cannot change owner-only settings (`sessionTimeoutMinutes`, `maxLoginAttempts`, `lockoutMinutes`, `requireEmailVerification`, `deviceBindingEnabled`).
- Course-scoped routes verify ownership (teacher) or active, unexpired enrollment (student) on every request — never trust the client.
- **Who runs a course** has exactly one definition: `modules/courses/courseStaff.js`. A course has a creator (`teacher`) and any number of accepted co-teachers (`coTeachers`), and every check — the middleware, and every query that filters by teacher — goes through `isCourseStaff()` / `staffCourseFilter()`. This is deliberate: co-teaching was added *after* dozens of ownership checks already existed, and a single forgotten `{ teacher: id }` comparison would have been a silent privilege bug. Co-teaching itself is invitation-based (`CoTeachInvite`, database-enforced against duplicate open invitations); only the creator or an administrator can change the teaching staff, so an invited colleague cannot remove the person who invited them.
- **Free lessons.** A lesson marked `isFree` on a `listed`, published course is readable by any authenticated user, enrolled or not. The rule is written once (`isFreeLesson` / `isFreeLessonMedia` in `middleware/courseAccess.js`) and asked by all three routes that can expose the content — the lesson route, the video stream-token issuer, and the file server — so a document, its video and its lesson can never drift apart. Quiz question images are outside it by construction: only a lesson's own `fileAsset` can match. Un-marking a lesson closes it, and its media, immediately. A preview viewer gets no progress record and no quizzes, assignments or announcements.
- **Payments are administrator-and-owner only.** An enrollment records what the student took (`mid` | `final` | `full`) and what they paid. The package is teaching information and goes to course staff; the money does not. The enrollment service excludes the payment fields from the query itself for any caller without `payments.manage`, so a teacher’s client never receives them — a client that hides a value it was sent is not access control. The two payment routes refuse a teacher outright, on their own course included. Corrections are audited with the old and the new value.
- **Q&A is moderated.** A student's question is stored `pending` and is visible only to its author and the course staff until a teacher approves it; a rejected question never reaches the class. Taking part in a thread requires a live enrollment — being the author is not enough, so a student removed from a course cannot keep posting through an old thread of their own.
- Quiz answer keys are `select: false` at the schema level; student-facing queries physically cannot include `isCorrect`, `correctAnswers`, or `explanation` unless a grading path opts in. Attempts snapshot questions at start, so editing a question never leaks into or corrupts a running attempt.
- Suspended/banned accounts fail authentication before any handler runs. Maintenance mode blocks all non-admin traffic at the same choke point.

## Injection & transport hardening

- **NoSQL injection**: all input passes Zod validation; `$`-prefixed and dotted keys are stripped from bodies recursively; queries use parameterized Mongoose APIs only.
- **XSS**: reviewed 2026-08-27 — no `dangerouslySetInnerHTML` anywhere; lesson content, announcements, Q&A, assignment instructions and grading feedback are rendered as text through React's escaping; helmet CSP restricts scripts to self; API responses are JSON with `nosniff`; SVG uploads are never served inline.
- **Logging**: request logs pass every URL through `redactUrl()` (stream `token`, verification `code`, `refreshToken` values are replaced with `[redacted]`); mail bodies (which carry one-time codes) are never logged in production; stacks are hidden in production.
- **Quiz autosave**: each save carries `clientSavedAt`; the server ignores a payload older than the last accepted one, so a slow request cannot overwrite newer answers. Submit always wins.
- **CSRF**: the API is JWT-in-header (not cookie) for state-changing calls, so cross-site form posts fail; the refresh cookie is path-scoped and `SameSite` per configuration, and the cookie-bearing routes check `Origin`; CORS is locked to `CLIENT_URL` + `ALLOWED_ORIGINS` with an explicit header allowlist.
- **Other**: hpp (parameter pollution), rate limiting on all API traffic with stricter buckets for auth/uploads/search, security headers via helmet, `trust proxy` + secure cookies for HTTPS deployments.

## File & video protection

- Uploads are validated four ways: extension allowlist, **declared MIME type** must agree with the extension, **magic-byte** content check, and an executable-header heuristic (PE/ELF headers, script extensions). When `CLAMAV_HOST` is configured every upload is additionally streamed to a **ClamAV** daemon (INSTREAM over TCP) and rejected on a detection; if the daemon is configured but unreachable, uploads **fail closed** (`503 SCANNER_UNAVAILABLE`). *The heuristic alone is not antivirus* — production deployments should run clamd. SVG (script-bearing) is accepted only for course thumbnails and is always served as an attachment, never inline. Assembled videos are sniffed for an MP4/MOV or WebM/MKV container before encryption. Stored names are UUIDs; originals are metadata only. Nothing under `storage/` is ever statically served — every byte flows through an authorization check.
- **Media key rotation.** Per-video keys are wrapped under a versioned master key (`MEDIA_KEY_VERSION`). To rotate: move the old key to `MEDIA_MASTER_KEY_PREVIOUS`, set the new `MEDIA_MASTER_KEY`, bump the version, deploy, then run `npm run migrate` (`002-rewrap-media-keys`) to re-wrap every stored key and retire the previous one. Stream tokens are five-minute HMACs derived from the current key, so a rotation only interrupts streams in flight. Production refuses to start if any two secrets are identical.
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

**The Android app is the exception.** Its window carries `FLAG_SECURE`, so the operating system itself refuses screenshots, screen recording and casting for the whole app — the control a browser cannot offer. It still does not stop a camera pointed at the screen, and a rooted device can bypass it. Students who need to capture course material legitimately should be told to use the web client.

## Android application

`docs/ANDROID.md` covers the build; this is the security posture.

- **Refresh token in the Keystore.** An AES-256-GCM key is generated inside the AndroidKeyStore and cannot be exported; the refresh token is stored as `base64(iv):base64(ciphertext)` in private SharedPreferences. Pulling the preferences file off a rooted device yields ciphertext that only that device's hardware key can unwrap. The access token stays in memory, exactly as on the web.
- **Cookies are not used on native.** The WebView runs on its own origin (`https://localhost`), so the refresh cookie is cross-site and unreliable there. The server's existing native contract sends a body copy of the refresh token to clients presenting `x-client-platform: android`, and only to those clients — the web client still gets the httpOnly cookie and nothing in JavaScript.
- **No cleartext in release.** The release network-security config permits TLS only, with no exceptions and no user-added CA trust. The debug variant alone allows cleartext, and only to the LAN dev host, the emulator loopback and localhost.
- **No certificate pinning, on purpose.** The app has no in-app update channel; a certificate rotation would brick every installed copy until users manually reinstalled. Pinning becomes appropriate once an update path exists.
- **`allowBackup=false`** so the encrypted store and app data are excluded from cloud and adb backups.
- **One permission: `INTERNET`.** No storage, camera, location or contacts access is requested.
- **No secret ships in the package.** An APK is world-readable; `scripts/scan-apk-secrets.mjs` unpacks every entry and fails the build if any value from `server/.env` appears in it. Run it before every release — the CI workflow does this automatically whenever an APK is present.

## Auditability

Every security-relevant event (70+ action types, including device binding, rejection, revocation, owner-protection blocks and security-setting changes) is written to MongoDB (`AuditLog`, immutable by convention — no update/delete endpoints exist) and mirrored to `server/logs/security.log`. Login history keeps device, browser, OS, IP, and fingerprint per attempt. Cheat events keep a per-attempt timeline that instructors can review before invalidating an attempt.
