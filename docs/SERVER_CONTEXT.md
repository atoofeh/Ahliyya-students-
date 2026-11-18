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
