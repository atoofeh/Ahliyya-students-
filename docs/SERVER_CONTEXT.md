# Server context

## November 8, 2026 (Asia/Amman) · Feker 1.0.6 privacy policy

- The production policy now serves the same bilingual HTML at `/privacy/`, `/privacy/index.html`, `/privacy-policy/`, and `/privacy-policy.html`. Direct HTTPS requests returned 200 for each route. The response SHA-256 was `a67e7877b40847fd94821ce628ed3f1a80bebc0d306898f42569086a00a73fa6`.
- The policy identifies the Play title `Feker/ فكر`, developer account `VortexMind`, app developer Mustafa ALRefaee, and package `com.alahliyya.lms`. It retains the current data handling and deletion disclosures. The public support page returned HTTP 200 and explains how to request deletion after signing in.
- The Android release keeps version name `1.0.6` and uses version code `8`. The verifier confirmed the same upload signer as code 7, matching policy copies, and direct links to `/privacy/index.html` in the app and its support pages. The rest of the bundle matched the original 1.0.6 payload.
- Play Console accepted the Production rollout and the change to the declared URL `https://students-alahliyaa.com/privacy/` for review.

## November 8, 2026 (Asia/Amman) · Feker 1.0.6 edited build

- The provided 6,940,120-byte bundle had version code 8 and SHA-256 `0143ec316c8bdfaa54fd508cc0ab650cf2df71fa2bd4596e369d41eacbcda4b8`.
- Google Play was already serving 1.0.6 with code 8. The edited bundle was rebuilt as code 9 with the same upload certificate. All 638 non-manifest payload files matched byte for byte, and the only manifest change was the version code. The rebuilt bundle SHA-256 was `603b27a002a359959b4bc8875e0a5538295ae47c602356c2af56a728e340eae5`.

## November 11, 2026, 19:55 (Asia/Amman) · Expanded production root filesystem

- On the Contabo VPS, `/dev/sda` reports 1,000 GiB. The root partition `/dev/sda1` was contiguous with 800 GiB of newly available space. A GPT metadata backup was saved at `/root/gpt-pre-root-expand-20261111.bin` before the table change.
- Relocated the GPT backup table to the end of the enlarged disk, expanded partition 1 with `growpart`, and grew the mounted ext4 filesystem online with `resize2fs`. No reboot or service restart was needed.
- Verification: `lsblk` reports `/dev/sda1` at 999 GiB; `df -hT /` and `df -hT /var/lib/lms/storage` report 968 GiB total, 44 GiB used, and 925 GiB available. `sgdisk -v /dev/sda` reports no GPT structural problems (it emits sector-alignment cautions for partitions 1 and 16; root is directly mounted ext4). `lms-api`, `mongod`, and `nginx` all report active.
- The LMS storage path and media were not moved; application configuration and media keys were not changed.

## November 19, 2026, 01:22–01:24 (Asia/Amman) · Playback and teacher workflow release

- Deployed the production website from release commit `6dde1f21a61068382e45b450edc319c64a4917e5`, together with the selected video/announcement API modules and announcement model. The server is not a Git checkout; this was a targeted file/artifact deployment.
- Verification: all 263 server regressions and 39 client checks passed locally; both packages linted cleanly. After deployment, 22 isolated synthetic encrypted-stream tests passed against the installed API source. These checks use temporary storage and mocked stream models, not production accounts or media.
- The `author_1_requestId_1` partial unique announcement index was verified in production. `lms-api`, `mongod`, and `nginx` report active; the production health endpoint returned `ok`. Only `lms-api` was restarted.
- Public verification matched SHA-256 hashes for the HTML entry and all 70 built assets. The entry SHA-256 is `97e09e3367c93a4d81fb0713c9b0f4e6b4e4272eafcf196b2b2d0d64b2fa0c43`. Desktop/mobile login rendering, privacy/support routes, authentication rejection, and retention of the previous player asset were checked successfully.
- Rollback files and the deployment/verification logs are retained under `/root/lms-releases/20261119-feker-1.0.8/`. Old hashed website assets were preserved for already-open clients. Production storage, media keys, account bindings and enrollments were not modified by this release.
- Android 1.0.8 (code 11) APK/AAB were built with the existing upload signer and passed signature/version and secret checks; see `docs/releases/1.0.8.md` for hashes. iOS source and embedded web assets were prepared as 1.0.8 (build 12); macOS signing, physical-device validation and store submission remain separate steps. Installed Apple apps do not receive the player-code change from the website deployment.

## November 19, 2026, 09:52–09:54 (Asia/Amman) · Responsive administration and video controls

- Deployed the production website and the course service API file for Feker 1.0.9. The pre-install course-service SHA-256 matched the committed baseline; the installed file matches the tested source (`5eeeb3c0d5ab7b68f913c8e592de011e28fa2734f6936aadc702f42773ac2008`). Only `lms-api` was restarted. No migration, media/key change or production account mutation was performed.
- Before publication, all 274 server tests and 50 client checks passed, and both packages linted cleanly. New checks cover literal partial/Arabic course search with authorization, optional generated/manual passwords, 13 administration views across phone/tablet/desktop widths in English/Arabic, playback speed retention and moving-watermark bounds on a 390px viewport. Browser tests use synthetic local fixtures, not production credentials or media.
- Public verification matched SHA-256 hashes for the entry HTML and all 72 built assets. Entry SHA-256: `abafcbb4ed4fda04342b6e8bb64746ca268f35a67ffb3b7ab7a7586c1ec7cf90`. Verification completed at 09:54 Asia/Amman: production health, privacy/support, protected-route rejection, old asset retention and fresh desktop/mobile login rendering passed. `lms-api`, `mongod` and `nginx` report active.
- Protected rollback files and install logs are under `/root/lms-releases/20261119-feker-1.0.9/`. Website assets from earlier releases were retained for existing browser tabs.
- Android 1.0.9 (code 12) APK/AAB were built, signed with the existing upload certificate, verified and scanned for server secrets. Artifact hashes are recorded in `docs/releases/1.0.9.md`. The iOS project and embedded assets were prepared as 1.0.9 (build 13); Mac signing, physical-device checks and store uploads remain outstanding. Website deployment does not update installed native web bundles.

## November 19, 2026, 10:25 (Asia/Amman) · Google Play 1.0.9 submission

- Independently verified and uploaded the provided `Feker-1.0.9.aab`, package `com.alahliyya.lms`, version code 12, 6,971,173 bytes, SHA-256 `c60accfaa337d9083ff5f8b45e888e12be01774a7e084939d627054a9c2964ee`. Embedded manifest, archive integrity, production API origin and continuity with the existing upload certificate were checked. The submitted artifact was not rebuilt.
- Play Console showed 1.0.7 available on Google Play and 178 country/region availability options before the update. Saved 1.0.9 as a full Production rollout at 100% in all targeted countries.
- Corrected Data safety answers using the current source and Google's definitions, including persisted account/device data, optional photo/video/document uploads, course messages and learning activity, and the available deletion-request instructions. Public support and privacy endpoints returned HTTPS 200 without authentication.
- At 10:25 Asia/Amman, Play Console showed both the 1.0.9 full rollout and Data safety questionnaire under Changes in review, with initial quick checks running and up to 13 minutes remaining. Managed publishing was off. This verifies submission, while approval and public availability of 1.0.9 remain pending. Proof screenshot is in the publication workspace at `outputs/Feker-1.0.9-review.jpg`.
- The handoff's physical Android device validation remains unverified. Play emitted two nonblocking warnings for absent deobfuscation data and native debug symbols.

## November 19, 2026, 15:39 (Asia/Amman) · Windows device-recognition compatibility

- Read-only inspection of the retained production website backups confirmed that the build preceding the 1.0.8 deployment lacked `__fekerDesktop` support but used `lms_device_id`; the following build contains both. An older EXE profile could therefore change from its registered UUID to the machine-derived ID when it loaded the desktop-aware website.
- Deployed the website and a focused seven-file authentication/model patch. The server accepts a compatibility upgrade only after password/account validation, exact proof of the current legacy credential, and historical EXE session evidence for that same user and binding. The compare-and-set updates the existing single-device record and writes `DEVICE_IDENTITY_MIGRATED`. No bulk reset or manual account mutation was performed by the deployment.
- Repository validation: 284 server and 59 client checks passed; both lints were clean. Ten additional isolated API checks passed against the exact production overlay, including wrong/missing credentials, account state, refresh recovery, revoked bindings, competing target IDs and preservation of the live native-client restriction. These checks use temporary synthetic accounts and storage.
- The deployed authentication baseline predates unrelated native multi-device/session-policy changes present in Git. Its SHA-256 values were checked before installation. The focused overlay preserves that verified live policy and adds Windows naming, session platform metadata and the guarded compatibility logic only. Do not assume a broad copy of the repository authentication modules is equivalent to this production patch.
- Production health and `lms-api`, `mongod`, `nginx` were healthy after restarting only `lms-api`. Public verification at 15:39 Asia/Amman matched the HTML and all 72 built assets (73 files), checked privacy/support and protected routes, retained old assets, and rendered fresh desktop/mobile login pages. Entry SHA-256: `3ccd0503f39a8cc197c9a79e1c4f9b1fc6f91659f6c177c6455a37ff9abe0180`.
- Baseline/installed source hashes, prior website and API backups, and deployment logs are retained under `/root/lms-releases/20261119-windows-identity/`. The existing EXE loads the website and needs no installer rebuild. Media, keys, enrollments and unrelated platform policy were preserved. See `docs/releases/windows-device-recognition.md` for the recovery conditions and limits.

## November 20, 2026, 17:14 (Asia/Amman) · Completed enrollment course access fix

- Production inspection confirmed students `duaaomar` (General Physiology, completed at 2026-11-20T12:07:00Z, progress 80%) and `randaljobori` (Engineering Workshop, completed at 2026-11-19T15:05:03Z, progress 100%) had their enrollment status set to `completed` upon meeting course completion thresholds. Because `requireCourseAccess` and downstream media/file services checked strictly for `status: 'active'`, both students were refused with HTTP 403 `NOT_ENROLLED` when opening course materials, despite remaining visible on the course roster and their dashboard `myEnrollments`.
- Deployed a focused 9-file backend patch covering `middleware/courseAccess.js`, `modules/courses/courses.service.js`, `modules/videos/videos.service.js`, `modules/files/files.routes.js`, `modules/bookmarks/bookmarks.routes.js`, `modules/qa/qa.routes.js`, `modules/enrollments/enrollments.service.js`, `modules/quizzes/quizzes.service.js`, and `jobs/index.js` to authorize `status: { $in: ['active', 'completed'] }`.
- Verification: all 9 files matched expected pre-install SHA-256 baselines on `/opt/lms/`. Deployment script syntax-checked patch files, backed up originals, installed files with `lms:lms` ownership, and restarted `lms-api`. `systemctl is-active lms-api mongod nginx` and health checks returned 200 OK.
- Direct live API check confirmed `duaaomar` in General Physiology and `randaljobori` in Engineering Workshop are both authorized successfully with `completed` enrollments attached. Real video stream tokens were issued successfully (`duaaomar`, view limit 4, TTL 300s). Rollback archives and install records are retained under `/root/lms-releases/20261120-completed-enrollments/`. No client or mobile rebuild was required.

## November 20, 2026, 22:01 (Asia/Amman) · Video player buffering overlay fix deployment

- Addressed a client-side player issue where the buffering overlay ("جارٍ تحميل الفيديو..." / `waiting` state) remained visible over uninterrupted, smooth video playback on iPad/Safari (WebKit).
- Root cause: WebKit routinely emits `stalled` socket events when the forward download buffer pauses, which previously set `waiting = true` without an accompanying playback resume event to clear it; additionally, spurious `waiting` events during active playback (`readyState >= 3`) and missing clears in `timeupdate` / `completeRestore` left the overlay stuck.
- Fix in `client/src/components/VideoPlayer.jsx`:
  - Removed `setWaiting(true)` from `onStalled` (download socket pause != playback starvation).
  - Guarded `onWaiting` to ignore spurious events when future playable data is already buffered (`readyState >= 3`).
  - Added self-healing in `onTimeUpdate` to clear `waiting` when playback time advances (`advanced > 0 || readyState >= 3`) and reset `restoring.current`.
  - Cleared `waiting` on `video.play()` resolution, `onCanPlayThrough`, `onProgress`, and user pause.
- Verification:
  - Local tests: 41 browser tests (including 5 new regression tests for socket stalls, readyState checks, and transient waiting dismissal) + 23 unit tests passed cleanly (64/64 passed); ESLint passed with 0 errors and 0 warnings.
  - Production build: `vite build` completed in 1.86s.
  - Production VPS deployment: Assets deployed under `/opt/lms/client/dist` via atomic `index.html` swap (`rsync -a --exclude=index.html` preserving existing hashed assets). Installed entry SHA-256: `6a0761c35a3af772c9d86ded51a620f9c266f0b473b5676fe3a9319c14c6ff29`.
  - Services `lms-api`, `mongod`, `nginx` verified active; health check returned 200 OK; public HTTPS `https://students-alahliyaa.com/` returned 200 OK.
  - Rollback archive retained under `/root/lms-releases/20261120-video-player-buffering/`. No server code or mobile rebuild required.

## November 20, 2026, 23:53 (Asia/Amman) · Nginx SPA entry cache-control header update

- Inspection of Windows desktop app (FekerDesktop Electron) traffic confirmed the desktop app loads `https://students-alahliyaa.com/` directly, but Chromium's HTTP disk cache preserved older `index.html` builds across app launches due to absent `Cache-Control` headers on SPA entry routes.
- Updated `/etc/nginx/sites-available/lms` to explicitly set `Cache-Control: "no-cache, no-store, must-revalidate"`, `Pragma: "no-cache"`, and `Expires: "0"` for `location = /index.html` and `location /`, while preserving `max-age=31536000, immutable` for hashed assets under `/assets/` and `/fonts/`.
- Verified `nginx -t` passed and reloaded `nginx`. Live HTTPS headers confirmed `Cache-Control: no-cache, no-store, must-revalidate` is returned on both `/` and `/index.html`. Backup saved at `/etc/nginx/sites-available/lms.bak`.
