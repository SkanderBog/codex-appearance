# Contributing

Start with the README setup and development commands. Keep changes focused on the Linux alpha and preserve the installed Codex files. Add meaningful regression tests when fixing bugs, especially around local files, IPC validation, archive preparation, and appearance restoration.

Use `npm run format` for JavaScript, CSS, HTML, JSON, and Markdown. Python scripts use the standard library except for image decoding with Pillow. Keep `release-files.txt` in sync with intended public source files. Do not add runtime copies or private diagnostic output.

The integration depends on a specific Codex build. To propose support for another build, first inspect its window integration and test the new adapter locally. A matching constructor string alone is not evidence of compatibility. Update the reviewed fingerprint only after validating rendering, controls, restoring styles, and sandboxed launch. Do not contribute copied application archives or binaries.

Please report your Linux distribution, desktop/compositor, graphics environment, companion version, Codex build, reproduction steps, and whether ordinary Codex works. Review reports for personal information before posting. For vulnerabilities, use the private reporting route in SECURITY.md.
