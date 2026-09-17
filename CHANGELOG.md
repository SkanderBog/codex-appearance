# Changelog

## 0.5.0-alpha.1

- Add experimental standalone macOS and Windows editors using pinned official Electron, without a Codex installation or account.
- Share local looks, photos, previews, undo/redo, and No look across editions; use native paths, fonts, dialogs, and Mac Command shortcuts.
- Disable styled Codex launch in standalone editions until native integration is reviewed and tested.
- Add deterministic native source ZIP archives and native-platform CI jobs.
- Verify signed-out Linux styling and restoration with an isolated authentication directory, without signing out the current account.

## 0.4.0-alpha.3

- Add a visible No look option to restore the normal Codex style while retaining preferences and saved looks.
- Show neutral previews while no look is active, with a selected-state indicator and undo/redo support.
- Preserve the disabled appearance state when opening styled Codex instead of silently reapplying a look.

## 0.4.0-alpha.2

- Replace continuous settings polling with directory change notifications, retaining a slower fallback for filesystems without notifications.
- Ignore conversation-text mutations when maintaining Panels and route markers; combine structural changes into one animation frame.
- Cache one bounded background photo, invalidating it when the file changes, disappears, or becomes a symlink.
- Combine queued style updates, skip unchanged styles and UI elements, and defer hidden floating-preview updates until shown.
- Add a repeatable photo-preview CPU benchmark and regression checks for notifications, update bursts, cache invalidation, and control repair.

## 0.4.0-alpha.1

- Add independent home and conversation artwork strength, including an option to hide artwork on either screen.
- Add independent sidebar, header, input, and conversation shading controls without fading text.
- Include Cathedral Foundry, Arcade Signal, and Night Shift using MIT-licensed Habitat backgrounds and adapted theme data, with portable attribution.
- Check input reachability, scrolling, and horizontal overflow after style application; disable the appearance layer when those checks detect a regression.
- Preview home and conversation artwork in both preview windows; migrate existing settings without changing their appearance.

- Suggest a dark palette from a local photo with one undoable action.
- Add redo and appearance undo/redo keyboard shortcuts outside text fields.
- Search saved looks by name, palette, or background type.
- Update and rename an existing saved look without creating a duplicate.

## 0.3.0-alpha.3

- Move Panels into the application menu bar so it stays clear of native window controls and text.
- Keep the conversation and composer inside the visible area when the summary is pinned, while resizing and during panel transitions.
- Add pointer hit testing for Panels and layout regression checks for every conversation-width setting.

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
