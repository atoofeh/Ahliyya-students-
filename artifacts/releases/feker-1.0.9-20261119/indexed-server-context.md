# Server context

## November 8, 2026 (Asia/Amman) · Feker 1.0.6 privacy policy

- The production policy now serves the same bilingual HTML at `/privacy/`, `/privacy/index.html`, `/privacy-policy/`, and `/privacy-policy.html`. Direct HTTPS requests returned 200 for each route. The response SHA-256 was `a67e7877b40847fd94821ce628ed3f1a80bebc0d306898f42569086a00a73fa6`.
- The policy identifies the Play title `Feker/ فكر`, developer account `VortexMind`, app developer Mustafa ALRefaee, and package `com.alahliyya.lms`. It retains the current data handling and deletion disclosures. The public support page returned HTTP 200 and explains how to request deletion after signing in.
- The Android release keeps version name `1.0.6` and uses version code `8`. The verifier confirmed the same upload signer as code 7, matching policy copies, and direct links to `/privacy/index.html` in the app and its support pages. The rest of the bundle matched the original 1.0.6 payload.
- Play Console accepted the Production rollout and the change to the declared URL `https://students-alahliyaa.com/privacy/` for review.

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
