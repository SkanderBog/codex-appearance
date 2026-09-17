# Native port and tester plan

Version 0.5.0-alpha.1 provides source-based standalone editors for macOS and Windows. They can edit, preview, save, import and export looks without Codex installed or signed in. They do not yet offer one-click installation or apply backgrounds and layout inside native Codex.

## Work needed for one-click opening

1. Bundle the companion with its own Electron runtime and photo decoder. Either package the existing Python/Pillow helper or replace it with an equivalently bounded native image pipeline, retaining the image-size, metadata-removal and color-contrast tests. Users must not need to install Node, Python or Pillow.
2. Produce a Mac application bundle and a Windows executable/installer from native CI runners. Test a clean machine without development tools and paths containing spaces. Build and verify each advertised architecture separately.
3. Sign release binaries. Public Mac distribution additionally needs notarization; the maintainer needs an Apple Developer identity. Windows distribution needs a suitable signing identity/service. Store signing credentials in protected CI secrets, never in source or tester reports. Early unsigned testing can precede this, but it is not a warning-free one-click public release.
4. Verify install, reopen, upgrade, removal and preservation of settings. Publish checksums and clearly label experimental builds.

Electron documents the [packaging workflow](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging) and [signing requirements](https://www.electronjs.org/docs/latest/tutorial/code-signing).

## Additional work needed for styled Codex

1. Identify installed Codex locations, version, architecture and supported launch behavior on each OS. Review the actual native build's window creation and UI selectors; do not infer support from the Linux version number alone.
2. Choose and implement a platform-specific integration that preserves the original installation and supports restoration. Prefer supported customization interfaces where available. Determine how each build's signing and archive-integrity protections affect the design before promising a copied-runtime strategy. Electron's [ASAR integrity documentation](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) explains why the existing Linux archive patch is not a drop-in native adapter.
3. Validate platform window behavior: transparency, title bars, dragging, native menus, keyboard shortcuts, resize/maximize/full-screen, task navigation, sidebar and summary layout. Run before and after sign-in without collecting account data.
4. Verify live edits, persistence across restart, No look, undo/redo, and recovery from failed styling. Unsupported builds must stop with an actionable explanation while ordinary Codex remains usable.
5. Add only successfully reviewed and tested builds to compatibility metadata. Retest after Codex updates; an unrecognized build is not automatically compatible.

Packaging alone does not complete this integration work. Until it is validated, the standalone editor keeps styled-Codex launch disabled.

## What testers can do now

Use the README's native source-preview setup. This initial preview still requires dependency installation. Test opening the editor, local photo import, all three included looks, floating preview, saving/exporting/importing a look, undo/redo, No look, and reopening. Verify file-picker cancel and save behavior, readability, window resizing and native keyboard shortcuts. A small generated or non-private photo is sufficient.

For each result report:

- Companion version and OS version.
- CPU architecture: Mac Apple Silicon/Intel or Windows x64/ARM64.
- Whether the editor started and the first failed step, if any.
- Codex version and installation method, if testing a future integration build.
- A brief expected/actual description; use demonstration content if a screenshot is needed.

Do not send credentials, authentication files, full account/profile directories or unreviewed logs. The automated standalone tests use generated fixtures. Future native integration tests should keep private screenshots local and return fixed check results.

Start full integration testing with one Apple Silicon Mac and one Windows x64 machine. Add Intel Mac and Windows ARM64 only when their builds and architecture-specific behavior have been checked. Automated runners can compile and exercise the editor; real-machine testers are still needed for Codex integration and desktop compositing.
