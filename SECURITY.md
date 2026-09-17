# Security

Only the latest alpha is maintained. This is experimental software that adapts an installed desktop runtime. Keep ordinary Codex available for recovery.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/SkanderBog/codex-appearance/security/advisories/new). Do not include credentials, account profiles, private conversation content, or unredacted logs in public issues. If private reporting is unavailable, open an issue requesting a private contact without describing the vulnerability.

The companion validates settings, restricts photo formats and sizes, removes EXIF data, denies renderer navigation and new windows, limits IPC to its own main frames, and preserves renderer sandboxing. The local Codex integration uses an in-process debugger and opens no debugging port. These controls do not isolate styled Codex from your normal account or filesystem permissions.

Dependency updates and compatibility changes need regression tests. Do not bypass the sandbox or integration fingerprint checks to make an unsupported installation run.
