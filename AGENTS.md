# Repository instructions

- Read `CLAUDE.md` for the repository's coding, architecture, security, and build conventions.
- Before any server, production, deployment, storage, security, or Android work, read `docs/SERVER_CONTEXT.md` first. Treat transcript-derived details there as historical until independently verified.
- Preserve production data and media keys. Never put production secrets in source, docs, logs, frontend variables, or Android artifacts.
- Do not deploy, restart production, rebuild release artifacts, or implement pending work based only on the context document; act when the user explicitly requests that work.
- After a future server/deployment/storage/security/Android change is actually verified, update `docs/SERVER_CONTEXT.md` with the date, timezone, evidence, and result. Keep historical claims distinct from new verification.
