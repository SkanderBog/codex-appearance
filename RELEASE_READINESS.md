# Release procedure

1. Review the source, dependency changes, and generated fixture provenance. Keep the compatibility table narrow and evidence based.
2. Run syntax, formatting, regression, and privacy checks. Test a freshly extracted source archive, including paths with spaces and isolated state.
3. Run graphical self-tests on a supported desktop; record the exact tested build and remaining coverage in TESTING.md. Keep raw reports and screenshots private.
4. Build with `npm run release:build`. Inspect the archive manifest, metadata, checksum, and complete payload. Publish source archives and checksums. For the requested native prototypes, also publish only the tested companion .app/.exe packages from the native CI artifact allowlist. These may contain official Electron and the frozen Python/Pillow helper with their license notices, never Codex runtime copies or test installations.
5. Before committing, inspect the explicit staged list. Use a GitHub no-reply identity and audit reachable history with `python3 scripts/release.py --check --git`.
6. Push reviewed source, verify CI, create an alpha tag and GitHub prerelease, then download the published assets and compare their hashes. Verify the remote branch and tag match the tested commit.

The source license covers the companion's own material. Linux Codex runtime copies are generated on the tester's machine from their existing installation and are excluded from distribution. Native prototypes launch an existing Codex installation and do not redistribute it. Electron and the image helper retain their own licenses and notices. A privacy scan is not a review of third-party redistribution rights.
