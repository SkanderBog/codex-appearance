# Changelog

## 0.3.0-alpha.2

- Make runtime preparation an explicit `prepare-runtime` command instead of an npm installation hook. A developer can install dependencies and run source tests without an installed Codex runtime.
- Verify an offline dependency install from a clean package with no Codex installation configured.
- The application code and supported Codex fingerprint are unchanged from alpha.1.

## 0.3.0-alpha.1

First public Linux alpha.

- Format and organize the companion source for maintenance.
- Add setup diagnostics and exact Codex compatibility checks before preparation.
- Use standard Linux data/cache directories on fresh installs while preserving existing local settings.
- Remove window titles from bridge diagnostics and original photo filenames from portable exports.
- Fix missing diagnostic directories on fresh installs and make runtime preparation atomic and serialized.
- Add a manifest-based source archive, checksums, privacy checks, regression tests, and Linux CI.
- Document setup, shared-account behavior, recovery, known limitations, and private security reporting.
