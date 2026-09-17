# Alpha verification

The public alpha is limited to Linux x86_64 and the reviewed Codex 26.901.41123 integration fingerprint.

Automated coverage includes settings validation, injection/path rejection, all palettes, bounded image decoding and EXIF removal, source-archive preservation, invalid archive rejection, sandbox-helper selection, path portability, unknown-build rejection, installer ownership checks, manifest exclusion, credential detection, and deterministic release archives.

GUI self-tests exercise actual controls, drag-and-drop image import, resizing, alpha rendering, saved-look import/export, undo, reset, and layout. An optional integration check exercises real Codex without sending prompts. Reports and screenshots stay local.

## 0.4.0-alpha.3 No look checks (2026-09-17)

- All 22 Node and 21 Python regression tests passed. Disabled previews render a neutral, opaque background without mutating stored look settings.
- All 54 companion graphical assertions passed, including clearing included and saved looks, preserving the saved-look library and preferences, the selected indicator after refresh, photo removal from both previews, undo, redo, and choosing a look again.
- All 27 real-Codex assertions passed from a temporary profile initially set to No look, including startup with no injected style or companion controls and subsequent layout recovery checks.
- The fresh source archive passed syntax, formatting, the 70-file manifest audit, and graphical/integration checks. Compatibility and remaining platform coverage are unchanged.

## 0.4.0-alpha.2 optimization checks (2026-09-17)

- All 21 Node and 21 Python regression tests passed, including real atomic settings-file replacement, ignored unrelated file changes, bounded update queues, and photo-cache invalidation.
- All 48 companion graphical assertions and 26 real-Codex integration assertions passed. Additional checks cover zero full-document companion scans during 60 streamed-content mutations, repair after structural navigation, unchanged UI nodes and styles, and hidden-preview catch-up. Thirty unchanged Codex refresh requests produced zero stylesheet rewrites; layout recovery still passed.
- A local before/after benchmark ran 400 photo-preview snapshots, including JSON serialization, three times per version. Median process CPU time decreased from 3614.8 ms to 3134.3 ms (about 13%); photo-file reads decreased from 800 to 1. Both versions produced 448,302,060 bytes of serialized output. This is a specific workload on one machine, not a claim about total Codex CPU or battery usage.
- The photo cache retains at most one image with up to 8 MiB of encoded text. Larger images remain supported without being retained in the cache. Native settings notifications perform no periodic settings-file polling; a 2-second polling fallback is used only if filesystem watching fails.
- Use `node scripts/benchmark.cjs [source-directory]` to repeat the photo workload against another checkout. Timing varies with hardware and system load; correctness checks assert work counts rather than timing thresholds.
- Syntax, formatting, the 70-file source manifest, and source/archive verification passed. Supported platforms and the remaining coverage below are unchanged.

## 0.4.0-alpha.1 release results (2026-09-17)

- All 17 Node and 21 Python regression tests passed, including schema migration, saved-look replacement, photo-derived palettes, bundled-asset hashes, attribution export/import, and layout-regression comparisons.
- All 44 graphical companion assertions passed: undo/redo, photo matching, saved-look search and updates, three included looks, separate home/conversation artwork, surface shading, embedded and floating previews, and the 900 × 620 minimum window size.
- All 25 real-Codex integration assertions passed, including 132 conversation-width fixtures, pointer access to Panels, independent surface opacity, nested-message shading, and automatic recovery from a deliberately obstructed input. No prompts were sent.
- Both native file-dialog checks (open and save) passed with generated fixtures.
- The source-only archive was extracted into a fresh path containing spaces. Dependency installation, regression and syntax checks, formatting, the 66-file release audit, graphical checks, and real-Codex integration checks passed from that extracted copy with isolated temporary state.
- The included-look and surface-control screenshots were inspected. The three bundled backgrounds were reviewed, their MIT licenses retained, and image metadata audited. Raw diagnostics remain private.
- The companion adds no runtime dependencies. The npm audit reported zero known vulnerabilities. Release archives are checked for deterministic contents and private-data exclusion.
- Palette contrast checks cover suggested solid colors; photos and desktop transparency can change actual readability. Layout recovery detects the checked geometry regressions after applying styles, not every possible future layout problem.

## 0.3.0 alpha release results (2026-09-17)

- 14 Node regression tests and 20 Python regression tests passed.
- JavaScript/shell syntax and source formatting checks passed.
- The source-only archive was extracted into a fresh directory containing spaces and launched from a different working directory, with separate temporary state and runtime paths.
- All 28 graphical companion assertions passed, including image export/import and opaque foreground pixels on translucent backgrounds.
- Both native file-dialog checks (open and save) passed using generated fixtures.
- All 19 real-Codex integration assertions passed; no prompts were sent. The original installed application archive's SHA-256 hash was unchanged.
- The reviewed source passed the manifest/privacy audit and Gitleaks 8.30.1 credential scan. Both production and development npm dependency audits reported zero known vulnerabilities.
- Alpha.3 verifies Panels with pointer hit tests and a real mouse click. All 132 layout fixtures passed across widths, summary visibility, animation positions, and scrollbar gutters. A separate live conversation passed 24 checks across the three width settings, sidebar open/closed, and 900/1280/1440/1800-pixel windows.
- Alpha.2 additionally verifies an offline `npm ci` with no compatible Codex installation configured; no runtime is prepared. The GUI-tested application code is unchanged from alpha.1.
- Release archives use deterministic ordering, timestamps, and owner metadata; regression tests check reproducibility and private-data exclusion.

The graphical tests used Ubuntu GNOME/Wayland with XWayland and Codex 26.901.41123 on one x86_64 machine. These results do not establish compatibility with other machines or builds. GitHub CI checks source behavior on Ubuntu 22.04 / Node 22 and Ubuntu 24.04 / Node 24; it does not include a Codex runtime or an authenticated GUI session.

## Coverage still needed

- A second physical Linux machine and other desktop/compositor/graphics combinations.
- Transparent-window resizing and maximization across those environments.
- Native Wayland support, ARM64, macOS, and Windows (not supported by this alpha).
- Future Codex builds (explicitly rejected until reviewed).
