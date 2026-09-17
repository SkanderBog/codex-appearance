# Release procedure

1. Review the source, dependency changes, and generated fixture provenance. Keep the compatibility table narrow and evidence based.
2. Run syntax, formatting, regression, and privacy checks. Test a freshly extracted source archive, including paths with spaces and isolated state.
3. Run graphical self-tests on a supported desktop; record the exact tested build and remaining coverage in TESTING.md. Keep raw reports and screenshots private.
4. Build with `npm run release:build`. Inspect the archive manifest, metadata, checksum, and complete payload. Publish only the source archive and SHA256SUMS.txt, never runtime copies.
5. Before committing, inspect the explicit staged list. Use a GitHub no-reply identity and audit reachable history with `python3 scripts/release.py --check --git`.
6. Push reviewed source, verify CI, create an alpha tag and GitHub prerelease, then download the published assets and compare their hashes. Verify the remote branch and tag match the tested commit.

The source license covers the companion's own material. Runtime copies are generated on the tester's machine from their existing installation and are excluded from distribution. A privacy scan is not a review of third-party redistribution rights.
