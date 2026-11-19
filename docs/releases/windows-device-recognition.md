# Windows device-recognition compatibility

Prepared November 19, 2026 (Asia/Amman).

The EXE loads the live website. Before desktop bridge support was deployed, that website could register a random UUID from the EXE's own browser profile. The desktop-aware website instead sends the Windows machine-derived ID. That identity switch can reject a legitimate student on the same laptop.

Read-only inspection of the production website backup confirmed that the build preceding the November 19 playback release contained `lms_device_id` support and lacked `__fekerDesktop` support. The following website build contains both. This confirms a rollout compatibility gap; it does not establish the cause of any particular student's incident without an account-level trace.

## Recovery behavior

The website offers an existing profile UUID during Windows password login, alongside the canonical desktop ID. It does not change ID precedence, create a replacement legacy ID, store tokens or require a rebuilt EXE.

After checking the password and account state, the server can upgrade the current single-device record only when all of the following hold:

- The request identifies the Windows app and supplies its 64-character canonical ID.
- The optional legacy value is a UUIDv4 whose hash matches this user's current authorized device.
- An existing session for that same user, binding and UUID records the EXE's `FekerDesktop/` user-agent marker. This is compatibility evidence, not native attestation.
- The binding is still active, belongs to the browser/desktop group, and has not changed during the operation.

A compare-and-set updates the same record, retaining one device slot. The standard login replaces old sessions and creates a session pinned to the canonical identity. An audit entry records the migration using the public display ID. Wrong passwords, foreign/missing old IDs, Chrome-only history and revoked/replaced bindings cannot authorize the upgrade. Already-upgraded identities remain valid even if stale profile data is supplied.

The student may need to close/reopen the EXE and sign in once. If its old profile was cleared, or the account was registered in Chrome or on another device, an administrator must use the existing reset process. IP or browser-fingerprint similarity is never accepted as proof of the same machine.

## Validation and deployment

The repository passed 284 server tests, 59 client checks and both ESLint checks. Ten API cases cover verified migration, invalid proof, account state, refresh recovery, revoked bindings and competing target IDs; eight client identity cases cover existing/fresh profiles, platform restrictions and storage failures. The actual-AuthProvider browser check verifies the Windows login payload and canonical request headers.

The live authentication modules predate some unrelated native-device/session-policy changes in the repository. The focused production overlay adds only Windows recognition, optional legacy proof, the guarded migration and its audit action. It retains the verified live device/session policy. Ten additional isolated API checks validate this overlay, including rejection of native clients attempting to use the Windows proof to bypass the existing live restriction. Do not replace the live authentication modules with a broader repository copy without reviewing those policy differences.

Deploy the website and focused authentication/model patch together, restart only the API, retain old website chunks, and verify installed hashes and health. No bulk device reset or database migration is required. Record actual deployment evidence in `docs/SERVER_CONTEXT.md`.
