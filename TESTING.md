# Alpha verification

The public alpha is limited to Linux x86_64 and the reviewed Codex 26.901.41123 integration fingerprint.

Automated coverage includes settings validation, injection/path rejection, all palettes, bounded image decoding and EXIF removal, source-archive preservation, invalid archive rejection, sandbox-helper selection, path portability, unknown-build rejection, installer ownership checks, manifest exclusion, credential detection, and deterministic release archives.

GUI self-tests exercise actual controls, drag-and-drop image import, resizing, alpha rendering, saved-look import/export, undo, reset, and layout. An optional integration check exercises real Codex without sending prompts. Reports and screenshots stay local.

## Local release results (2026-09-17)

- 14 Node regression tests and 20 Python regression tests passed.
- JavaScript/shell syntax and source formatting checks passed.
- The source-only archive was extracted into a fresh directory containing spaces and launched from a different working directory, with separate temporary state and runtime paths.
- All 28 graphical companion assertions passed, including image export/import and opaque foreground pixels on translucent backgrounds.
- Both native file-dialog checks (open and save) passed using generated fixtures.
- All 15 real-Codex integration assertions passed; no prompts were sent. The original installed application archive's SHA-256 hash was unchanged.
- The reviewed source passed the manifest/privacy audit and Gitleaks 8.30.1 credential scan. Both production and development npm dependency audits reported zero known vulnerabilities.
- Alpha.2 additionally verifies an offline `npm ci` with no compatible Codex installation configured; no runtime is prepared. The GUI-tested application code is unchanged from alpha.1.
- Release archives use deterministic ordering, timestamps, and owner metadata; regression tests check reproducibility and private-data exclusion.

The graphical tests used Ubuntu GNOME/Wayland with XWayland and Codex 26.901.41123 on one x86_64 machine. These results do not establish compatibility with other machines or builds. GitHub CI checks source behavior on Ubuntu 22.04 / Node 22 and Ubuntu 24.04 / Node 24; it does not include a Codex runtime or an authenticated GUI session.

## Coverage still needed

- A second physical Linux machine and other desktop/compositor/graphics combinations.
- Transparent-window resizing and maximization across those environments.
- Native Wayland support, ARM64, macOS, and Windows (not supported by this alpha).
- Future Codex builds (explicitly rejected until reviewed).
