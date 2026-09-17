# Native prototype and tester plan

Version 0.6.0-alpha.1 adds a self-contained Mac Apple Silicon application and Windows x64 executable. Opening the companion automatically opens a reviewed installed Codex with the saved appearance. The editor runtime and image decoder are bundled; testers do not need Node, Python or npm.

## Current compatibility

| Prototype   | Reviewed native Codex version |
| ----------- | ----------------------------- |
| macOS ARM64 | 26.911.61220                  |
| Windows x64 | 26.908.70816                  |

The launcher verifies main-process and startup code fingerprints, not just the visible version number. Updated or unsupported builds are rejected before launch. No Intel Mac or Windows ARM64 integration is claimed.

The native launcher uses the reviewed app's enabled startup inspector on an ephemeral loopback port, loads the local appearance hook before application startup, resumes, and closes/verifies that inspector. It preserves the installed files, signatures and security fuses. It does not patch a signed application on disk or enable a disabled debugging capability. Native traffic lights/window controls remain in place; No look restores backgrounds and native vibrancy/material.

The prototype is unsigned/unnotarized. A first-open OS warning or an organizational block is possible. Do not disable operating-system security or organization policy to test it. Public signing and notarization require maintainer signing identities; see [Electron's signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing).

## Install and open

1. Use an existing compatible official Codex installation. Do not downgrade a working application just for this test.
2. Download the matching prototype ZIP and checksum from the release, verify the checksum, and extract it.
3. On Mac, place **Codex Appearance.app** in a permanent folder and open it. On Windows, keep the entire extracted folder together and open **Codex Appearance.exe**.
4. Codex should open already styled, with the appearance editor available for changes. A new companion setup starts with Graphite. Existing saved settings remain in the same native companion data directory.
5. If discovery fails, use **Locate Codex**. An unsupported build should produce a version explanation rather than a launch-success message.

Use a generated or non-private image for testing. No login is needed for editor, image, or signed-out appearance checks. Authentication and chat/model access remain Codex's responsibility.

## Test sequence

- Open by double-clicking the app/executable, without a terminal or development tools.
- Confirm the saved palette and photo appear in Codex, including before sign-in.
- Change colors, fonts, photo crop/blur and opacity. Confirm text remains readable.
- Use a saved look, **No look**, undo and redo; close and reopen to check persistence.
- Check Mac traffic lights or Windows minimize/maximize/close controls, resizing and full-screen behavior.
- If signed in, test task navigation, composer access, sidebar reveal, summary panels and scrolling using non-private demonstration content. Do not send a prompt solely for testing unless you want to.
- Close the appearance editor, reopen it, and double-click the prototype again. It should focus/reuse its styled Codex instance rather than create a conflicting second instance.
- Quit ordinary and styled windows normally; confirm ordinary Codex still launches and retains its original appearance.

## Report results

Provide companion version, OS version, processor architecture, Codex version/installation method, the first failing step, and a short expected/actual description. For unsupported builds, the visible Codex version is enough to begin review. A version match is not a reason to bypass a fingerprint rejection.

Do not send passwords, authentication files, account/profile directories or unreviewed logs. Use demonstration content for any screenshot. Automated CI uses fresh signed-out profiles and generated image fixtures; native Codex downloads and private profiles are excluded from prototype artifacts.

Automated native runs are necessary but do not establish every physical-device rendering, graphics-driver, authenticated-layout or window-management behavior. Start physical testing with one Apple Silicon Mac and one Windows 11 x64 machine. Add more architectures only after their native builds have been inspected and tested.
