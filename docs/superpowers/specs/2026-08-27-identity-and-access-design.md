# Identity & Access Hardening — Design

**Date:** 2026-08-27
**Status:** Approved (design), pending spec review
**Scope:** Sub-projects 1–3 of the production-hardening mission: foundation, four-role hierarchy with a protected owner, and strict one-account/one-authorized-device access with the refresh-token storage fix.

This spec covers the server, the test harness, and the minimum client changes needed to keep the app working under the new model. The admin Security Center UI, the security sweep (rate limits, uploads, CSRF/XSS/IDOR tests), the study-UI redesign, and Android are separate specs and are not blocked by anything here.

---

## 1. Baseline (recorded 2026-08-27)

- `server`: 29/29 smoke scenarios pass against in-memory MongoDB.
- Node 22.17, npm 10.9, git 2.53. Repository initialised at commit `2ee5f45` with a `.gitignore` excluding `node_modules`, `storage/`, `logs/`, `.env`, `client/dist`.
- No MongoDB is reachable locally; `server/storage/` holds ~1.6 GB of encrypted media whose documents live in a database that is not currently running. **Storage is read-only for the whole mission.** A cloud MongoDB URI will be supplied later; every data migration therefore has a `--dry-run` mode.
- The existing smoke test writes into the real `server/storage/` and `server/logs/` trees. This is fixed in §3.

## 2. Decisions

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| 1 | Permission model | Central permission map + `requirePermission()` middleware; `authorize()` kept with one extra rule (`super_admin` satisfies `admin`) | CASL (dependency + new mental model); scattered role checks (the drift the mission warns about) |
| 2 | Device credential | Client-generated UUID v4; server stores SHA-256; fingerprint is a logged supporting signal | Server-issued device token (same web threat model, more parts); WebAuthn (out of scope, noted as the ceiling) |
| 3 | Refresh token transport | Web: httpOnly cookie only, access token in memory. Native (`x-client-platform: android`): body copy also returned for Keystore storage | WebView cookie-jar workarounds |
| 4 | Test runner | Node built-in `node:test` | Vitest/Jest (new dependency for a pure-API suite) |
| 5 | Owner identity | New `super_admin` created from `SUPER_ADMIN_*` env; existing `admin` account stays `admin` | Promoting the existing `admin` |
| 6 | Bootstrap accounts and email verification | Bootstrap-seeded accounts (owner, Abdullah, dev admin) are created `emailVerified: true`, `mustChangePassword: true` | Requiring an SMTP round-trip for operator-configured accounts |

## 3. Foundation

### 3.1 Environment
- `server/.env.example` and `client/.env.example`: every variable name, no real values, comments on which are required in production.
- `server/src/config/env.js`:
  - Remove the `Admin@12345` default. `ADMIN_EMAIL`/`ADMIN_PASSWORD` become optional; when `ADMIN_PASSWORD` is unset the legacy `admin` dev account is not seeded.
  - Add `SUPER_ADMIN_NAME` (default `Platform Owner`), `SUPER_ADMIN_USERNAME` (default `owner`), `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_INITIAL_PASSWORD`.
  - Add `DEFAULT_ADMIN_NAME` (default `Abdullah Dabbas`), `DEFAULT_ADMIN_USERNAME` (default `abdullah.dabbas`), `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_INITIAL_PASSWORD`.
  - Add `LOG_DIR` (default `server/logs`), `ALLOWED_ORIGINS` (comma list, default empty), `REFRESH_COOKIE_SAMESITE` (`lax` | `none` | `strict`, default `lax`).
  - Password variables are validated with the same strength rule as user passwords when present.
- `server/src/config/logger.js` reads `LOG_DIR` instead of a hard-coded path.

### 3.2 Server lint
- `server/eslint.config.js`: `@eslint/js` recommended, `globals.node`, `sourceType: commonjs`. Rules beyond recommended: `no-unused-vars` (`argsIgnorePattern: '^_'`), `prefer-const`, `eqeqeq: ['error', 'smart']`, `no-var`. No formatting rules.
- `npm run lint` in `server/package.json`. Existing code must pass with at most targeted fixes (no mass reformatting).

### 3.3 Test harness
- `server/tests/helpers/harness.js` exports `startApp()` → `{ baseUrl, stop, api, loginAs, seedUsers }`.
  - Sets `NODE_ENV=test`, an unreachable `MONGODB_URI` (forces in-memory), `STORAGE_ROOT` and `LOG_DIR` to a fresh directory under `os.tmpdir()`, `LOG_LEVEL=error`, and test values for all `SUPER_ADMIN_*` / `DEFAULT_ADMIN_*` / `ADMIN_*` variables **before** requiring `src/config/env`.
  - `api(method, path, { token, body, deviceId, fingerprint, platform, headers })` — every call sends `x-device-id`; default device id is per-`api` instance so tests can model distinct devices explicitly.
  - Cleans its temp directory on `stop()`. Never touches `server/storage` or `server/logs`.
- `npm test` → `node --test tests/`. Files: `smoke.test.js` (existing 29, converted), `rbac.test.js`, `owner.test.js`, `devices.test.js`, `auth.test.js`, `seed.test.js`.

## 4. Roles and permissions

### 4.1 Roles
`server/src/config/constants.js`:
```js
ROLES = { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', TEACHER: 'teacher', STUDENT: 'student' }
ROLE_RANK = { student: 0, teacher: 1, admin: 2, super_admin: 3 }
```
`User.role` enum accepts all four. Existing stored values are unchanged.

### 4.2 Permission map — `server/src/core/permissions.js`
Exports `PERMISSIONS` (string constants), `ROLE_PERMISSIONS` (role → `Set`), `hasPermission(role, perm)`, `isAdminRole(role)` (admin or super_admin), `ROLE_RANK`, `canAssignRole(actorRole, targetRole)`.

| Permission | student | teacher | admin | super_admin |
|---|---|---|---|---|
| `users.view`, `users.create`, `users.update`, `users.suspend`, `users.delete`, `users.reset_password`, `users.force_logout` | | | yes (targets: student/teacher only) | yes |
| `admins.view` | | | yes | yes |
| `admins.create`, `admins.manage` | | | | yes |
| `courses.manage_any` | | | yes | yes |
| `courses.manage_own` | | yes | yes | yes |
| `enrollments.manage`, `access_codes.manage` | | | yes | yes |
| `sessions.view`, `sessions.revoke` | | | yes | yes |
| `devices.view`, `devices.reset` | | | yes (targets: student/teacher only) | yes |
| `audit.view`, `login_history.view` | | | yes | yes |
| `anticheat.platform` | | | yes | yes |
| `analytics.global` | | | yes | yes |
| `announcements.global` | | | yes | yes |
| `files.global` | | | yes | yes |
| `settings.view`, `settings.manage` | | | yes | yes |
| `security.manage` (owner-only settings keys) | | | | yes |
| `maintenance.manage` | | | yes | yes |

"Targets: student/teacher only" is not expressed in the map; it is enforced by `assertCanManage` (§5).

### 4.3 Middleware — `server/src/middleware/authorize.js`
- `authorize(...roles)`: passes if `roles.includes(req.user.role)`, **or** `req.user.role === 'super_admin' && roles.includes('admin')`. Nothing else changes, so every existing `authorize('teacher','admin')` route admits the owner.
- `requirePermission(...perms)`: passes if the user's role has **all** listed permissions; otherwise `403 FORBIDDEN` with message `Missing permission: <perm>`.
- Routes migrated to `requirePermission` in this spec: the whole `admin` module; `enrollments` access-code and assign routes; the new owner routes. Teacher/course routes keep `authorize` + `courseAccess`.

### 4.4 `isAdminRole()` sweep
Every `role === 'admin'` / `role !== 'admin'` comparison in the server goes through `isAdminRole()`. Known sites: `middleware/authenticate.js` (maintenance gate), `middleware/courseAccess.js` (both guards), `modules/files/files.routes.js`, `modules/qa/qa.routes.js`, `modules/search/search.routes.js`, `modules/videos/videos.service.js`, `modules/files/files.service.js`, `modules/courses/courses.service.js`, `modules/announcements`, `modules/analytics`, `modules/quizzes/quizzes.service.js` (`isStaff`), `modules/anticheat`. The plan enumerates them from a `grep`.

## 5. Owner protections (server)

`server/src/modules/admin/admin.service.js` gains one guard used by every mutating admin operation:

```
assertCanManage(actor, target, intent)
// intent: 'update' | 'status' | 'delete' | 'reset_password' | 'force_logout' | 'device_reset' | 'role_change'
```
Rules, in order:
1. `actor.id === target.id` → `400 SELF_ACTION` (no admin route may mutate its own account; profile changes go through `/auth/me`).
2. `target.role === 'super_admin'` and `actor.role !== 'super_admin'` → `403 OWNER_PROTECTED`, audit `OWNER_ACTION_BLOCKED { intent }`.
3. `target.role === 'admin'` and actor lacks `admins.manage` → `403 FORBIDDEN`.
4. `intent === 'role_change'`: the new role must satisfy `canAssignRole(actor.role, newRole)`: never `super_admin` (for anyone); `admin` only with `admins.create`; otherwise `ROLE_RANK[newRole] < ROLE_RANK[actor.role]`.

Additional invariants:
- `createUser` with `role: 'super_admin'` → `400` for every caller. The owner exists only through bootstrap.
- `createUser` with `role: 'admin'` requires `admins.create`; audit `ADMIN_CREATED`.
- Suspending/banning an `admin` audits `ADMIN_DISABLED` in addition to `USER_SUSPENDED`/`USER_BANNED`.
- `updateSettings`: keys in `OWNER_ONLY_SETTINGS = ['sessionTimeoutMinutes','maxLoginAttempts','lockoutMinutes','requireEmailVerification','deviceBindingEnabled']` require `security.manage`; a non-owner sending any of them gets `403 OWNER_PROTECTED` and nothing is written. Changes to those keys audit `SECURITY_SETTING_CHANGED { keys }`.
- Force-logout of a `super_admin` by anyone other than a `super_admin` → `403 OWNER_PROTECTED`.
- Audit log remains append-only: no update/delete endpoint exists; this spec adds none.

## 6. Bootstrap and migrations

### 6.1 `server/src/seed.js` (idempotent)
Run order: owner → Abdullah → legacy dev admin → settings singleton.

- **Owner.** If any `super_admin` exists (`deletedAt: null`) → do nothing. Else if `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_INITIAL_PASSWORD` are set → create `{ name, username, email, password, role: 'super_admin', status: 'active', emailVerified: true, mustChangePassword: true }`, audit `USER_CREATED { bootstrap: 'owner' }`, log `Owner account created (username: …)`. Else: development → warn; production → throw (startup fails).
- **Abdullah.** If a user with `DEFAULT_ADMIN_USERNAME` exists → do nothing. Else if `DEFAULT_ADMIN_INITIAL_PASSWORD` is set → create `{ name: DEFAULT_ADMIN_NAME, username, email: DEFAULT_ADMIN_EMAIL || undefined, role: 'admin', emailVerified: true, mustChangePassword: true }`, audit `ADMIN_CREATED { bootstrap: true }`. Else skip with a warning.
- **Legacy dev admin.** Only when `NODE_ENV !== 'production'` and `ADMIN_PASSWORD` is set and no user `admin` exists.
- Never logs a password. Never modifies an existing account.

### 6.2 Startup behaviour (`server/src/server.js`)
- `NODE_ENV !== 'production'`: run `seed()` on boot (unchanged convenience).
- `NODE_ENV === 'production'`: do **not** seed on boot. Verify a `super_admin` exists; if not, log `No owner account. Run: npm run seed` and exit 1.

### 6.3 Scripts
- `npm run seed` → `node src/scripts/seed.js` (connect, seed, disconnect; exit non-zero on failure).
- `npm run migrate [-- --dry-run] [-- --force-relogin]` → `node src/scripts/migrate.js`. Applies numbered files from `src/migrations/` not yet recorded in the `_migrations` collection. Dry-run prints intended operations and writes nothing.
- `src/migrations/001-roles-and-devices.js`: reports user counts per role; fails if any role value is outside the four-role enum; ensures the `Device` indexes exist; with `--force-relogin` increments `tokenVersion` for every user and deactivates every session (`endReason: 'policy_relogin'`).

## 7. Device binding

### 7.1 Model — `server/src/models/Device.js`
```
user            ObjectId → User, required
deviceKeyHash   String, required, select:false   // sha256(deviceId)
publicId        String                           // first 8 hex chars of sha256(deviceId + user) for display
fingerprintHash String|null
platform        'web' | 'android' | 'ios' | 'other'
browser, os, deviceType, model   String
appVersion      String
firstAuthorizedAt, lastSeenAt   Date
lastIp          String
status          'active' | 'revoked'
revokedAt       Date|null
revokedBy       ObjectId|null
revocationReason String|null
```
Indexes: `{ user: 1 }` **unique, partial `{ status: 'active' }`** — the database guarantees at most one active device per user; `{ user: 1, createdAt: -1 }` for history.

`Session` gains `device: ObjectId → Device | null` and `deviceKeyHash: String | null (select:false)`; `endReason` enum gains `'device_revoked'`, `'device_mismatch'`, `'policy_relogin'`.

`PlatformSetting` default `deviceBindingEnabled: true` (owner-only key).

### 7.2 Login — `AuthService.login`
Order (enumeration-safe):
1. Rate limit (existing bucket).
2. Normalise username; `deviceId` required (`400 DEVICE_REQUIRED`), 8–128 chars.
3. Find user. If absent, compare the password against a fixed dummy bcrypt hash so timing matches, then fail generically.
4. Compare password. Wrong → increment counter, lockout logic as today, fail `Invalid username or password` **regardless of account state**.
5. Only after a correct password: `locked` (423), `banned` (403), `suspended` (403) with their specific messages. (Lockout is still enforced — a locked account with the right password is refused — but a wrong password never reveals lock state.)
6. Device binding (if `settings.deviceBindingEnabled`):
   - `active = Device.findOne({ user, status: 'active' }).select('+deviceKeyHash')`
   - none → `Device.create({... status: 'active'})`. On `E11000` re-read; if the winner's hash ≠ ours → treat as "different device". Audit `DEVICE_BOUND`, or `DEVICE_CHANGED` if any revoked device exists for the user.
   - hash matches → update `lastSeenAt`, `lastIp`, `fingerprintHash` (log `DEVICE_FINGERPRINT_DRIFT` to the security logger when it changed), `appVersion`, `platform`.
   - different → `LoginHistory` reason `device_not_authorized`, audit `DEVICE_LOGIN_REJECTED`, throw `403 DEVICE_NOT_AUTHORIZED` — message: *This account is already linked to another device. Contact an administrator or request a device reset.*
7. Single-active-session (unchanged): other sessions for the user end with `new_device_login` (name kept for compatibility; semantically "new login").
8. Create `Session` with `device` and `deviceKeyHash`; sign tokens; write login history and audit `LOGIN`.

`x-client-platform` header (`web` default, `android`, `ios`) and `x-app-version` are read for the device record.

### 7.3 Per-request validation — `middleware/authenticate.js`
After the existing checks, if `session.deviceKeyHash` is set: `x-device-id` must be present and `sha256(header) === session.deviceKeyHash`; otherwise end the session (`device_mismatch`), audit `DEVICE_MISMATCH`, and throw `401 SESSION_TERMINATED` (the client shows the generic "session ended" message; the specific reason is in the audit log). Sessions without a hash (pre-migration) are allowed until they expire.

### 7.4 Refresh — `AuthService.refresh`
Requires `x-device-id` to match `session.deviceKeyHash` when set; mismatch ends the session and returns `401 SESSION_TERMINATED`. Reuse detection unchanged (audit action renamed to `TOKEN_REUSE_DETECTED`; `SESSION_TERMINATED` still written).

### 7.5 Revocation
Single service function `DeviceService.revoke({ target, actor, reason, self })`:
1. `Device.updateMany({ user: target, status: 'active' }, { status: 'revoked', revokedAt, revokedBy, revocationReason })`.
2. `Session.updateMany({ user: target, isActive: true }, { isActive: false, endedAt, endReason: 'device_revoked' })`.
3. `User.tokenVersion += 1`.
4. Audit `DEVICE_REVOKED { actor, target, reason, self }`.

Routes:
- `GET /admin/users/:userId/device` — `devices.view`; returns active device (public fields) + revoked history.
- `POST /admin/users/:userId/device/revoke { reason }` — `devices.reset` + `assertCanManage(intent: 'device_reset')`. `reason` required, 3–300 chars.
- `POST /auth/logout { forgetDevice?: boolean }` — existing logout; with `forgetDevice: true` also calls `revoke(self: true, reason: 'user_forget_device')`.
- `GET /auth/device` — the caller's own active device (public fields) for the profile page.

### 7.6 Concurrency
Two simultaneous first logins for a device-less account: both pass the password check, both attempt `Device.create`; the partial unique index admits exactly one. The loser re-reads the active device, sees a foreign hash, and is rejected. Covered by a test that fires both logins with `Promise.all` and asserts exactly one `200` and one `403 DEVICE_NOT_AUTHORIZED`, then that the winner's session works and the loser has none.

## 8. Token storage

### 8.1 Server
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/change-password` respond with `{ user, accessToken }` and set the refresh cookie. `refreshToken` is included in the body **only** when `x-client-platform` is `android` or `ios`.
- Refresh cookie: `httpOnly: true`, `secure: NODE_ENV === 'production'`, `sameSite: REFRESH_COOKIE_SAMESITE`, `path: '/api/v1/auth'`, `maxAge` 7d / 30d (rememberMe).
- `POST /auth/refresh` reads the token from the cookie, or from the body only when `x-client-platform` is native.
- `POST /auth/refresh` and `POST /auth/logout` check `Origin` (when present) against `CLIENT_URL` + `ALLOWED_ORIGINS`; mismatch → `403 ORIGIN_NOT_ALLOWED`. Requests with no `Origin` header (native WebViews, curl) are allowed — the cookie policy and device check cover those.
- CORS `allowedHeaders` gains `x-client-platform`, `x-app-version`.

### 8.2 Client
- `client/src/api/token.js`: module-level `accessToken` with `getAccessToken()` / `setAccessToken()` / `clearAccessToken()`. Nothing token-related is written to `localStorage` anymore; `lms_access_token` and `lms_refresh_token` keys are removed on first load.
- `axios.js`: request interceptor reads the in-memory token; refresh uses the cookie (`withCredentials`) with no body; a single in-flight refresh promise is shared; `DEVICE_NOT_AUTHORIZED` is *not* a logout trigger (it only occurs on login).
- `AuthContext`: on mount, if no in-memory token, `POST /auth/refresh` once; success → set token + user; failure → unauthenticated. `lms_user` (non-sensitive profile) stays in `localStorage` for instant paint and is re-validated by the refresh.
- Consumers of the old key switch to `getAccessToken()`: `hooks/useAntiCheat.js` (unload beacon). `VideoPlayer` and `ChunkedUploader` already go through `api` and need no change.
- `LoginPage`: `DEVICE_NOT_AUTHORIZED` renders the specific message; all other login failures render the server message.

## 9. Audit actions added
`DEVICE_BOUND`, `DEVICE_CHANGED`, `DEVICE_LOGIN_REJECTED`, `DEVICE_REVOKED`, `DEVICE_FINGERPRINT_DRIFT`, `TOKEN_REUSE_DETECTED`, `ADMIN_CREATED`, `ADMIN_DISABLED`, `SECURITY_SETTING_CHANGED`, `OWNER_ACTION_BLOCKED`, `POLICY_RELOGIN`. Existing action names are kept (`LOGIN`, `LOGIN_FAILED`, `DEVICE_MISMATCH`, …) to avoid churn in existing logs.

## 10. Client changes in this spec
- Token refactor (§8.2).
- `App.jsx` / `MainLayout.jsx`: `super_admin` routed to the admin tree; role label "Owner"; `Protected roles={['admin']}` accepts `super_admin`.
- `AdminUsers.jsx`: role selector never offers `super_admin`; `admin` offered only to the owner; rows for `super_admin` show an "Owner" badge with mutating actions disabled; user detail gains an **Authorized device** panel (public id, platform/browser/OS, first authorised, last seen) with **Revoke device** (reason prompt, confirm) and the revoked history.
- `AdminSettings.jsx`: owner-only keys shown read-only with an "Owner setting" tag for non-owners.
- Error copy (`apiError` mapping): `SESSION_TERMINATED` → "Your session has ended. Please sign in again."; `DEVICE_NOT_AUTHORIZED` → the sentence in §7.2.

## 11. Tests

All in `node:test`, all through the harness, all with explicit device ids.

- **smoke.test.js** — the existing 29 scenarios, converted; the "teacher blocked from generating access codes" and "admin generates access codes" scenarios remain (codes are admin-only by design; docs will be corrected in the docs spec).
- **rbac.test.js** — Phase 69 matrix: student → teacher/admin/owner endpoints 403; student cannot read another student's attempt or modify another enrollment; teacher own vs foreign course; teacher cannot create admin or touch settings; admin can manage students/teachers and courses; admin cannot create admin, cannot promote self, cannot write owner-only settings; owner can do all of it.
- **owner.test.js** — Phase 70 + §5: seed creates the owner and Abdullah; rerun does not duplicate; Abdullah is `admin`; Abdullah cannot reach owner-only routes, cannot change his own role, cannot suspend/delete/reset/force-logout/device-reset the owner (`OWNER_PROTECTED` + `OWNER_ACTION_BLOCKED` audit row); Abdullah can create a student and a teacher; owner can suspend and device-reset Abdullah; nobody can create a `super_admin`.
- **devices.test.js** — Phase 68 + Phase 75 sequence: first login binds (`DEVICE_BOUND`); same device logs in again; different device → `DEVICE_NOT_AUTHORIZED`; the trusted device is still functional afterwards; wrong password from a foreign device returns the generic message (not the device message); admin revoke → old device's next request `401 SESSION_TERMINATED`; new device binds (`DEVICE_CHANGED`); refresh with a revoked device fails; replayed rotated refresh token fails; access token used with a different `x-device-id` fails; spoofed `x-device-id` without the session's token fails; admin cannot revoke owner device; concurrent first logins → exactly one binds; `deviceBindingEnabled: false` disables the check; `logout { forgetDevice: true }` allows a new device to bind.
- **auth.test.js** — Phase 71: valid login; wrong password; unknown user (same message and status as wrong password); suspended/banned with wrong password → generic; with right password → specific; forced password change gate blocks course APIs and allows the onboarding allowlist; locked account after N failures; refresh rotation; logout ends the session; password change revokes other sessions; admin password reset forces onboarding; role change kills sessions; delete blocks login.
- **seed.test.js** — production mode with no owner and no `SUPER_ADMIN_*` throws; production mode with an existing owner passes without seeding; development without `ADMIN_PASSWORD` creates no `admin`; migration dry-run writes nothing; `--force-relogin` bumps every `tokenVersion`.

Definition of done for this spec: `npm run lint` clean in both packages, `npm test` green with every file above, `npm run build` in `client` succeeds, and the Device A / Device B / reset / re-bind sequence is demonstrated by `devices.test.js` using two distinct device ids (the manual two-browser-profile run is repeated in the Android spec).

## 12. Documentation to update after implementation
`docs/SECURITY.md` (sessions, devices, token storage — including the honest statement that on the web the device id lives in browser storage and WebAuthn is the ceiling), `docs/API.md` (new routes, changed login/refresh bodies, `x-client-platform`), `docs/ARCHITECTURE.md` (roles, Device collection, scripts), `README.md` (roles table, env vars, `npm run seed` / `migrate`), `CLAUDE.md` (four roles, permission file, test layout).
