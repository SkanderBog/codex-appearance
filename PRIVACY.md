# Privacy

The companion implements local appearance controls. It does not implement telemetry, analytics, cloud sync, remote updates, credential collection, or a photo upload endpoint. Installing the optional standalone runtime downloads Electron and its npm dependencies; ordinary editing and previews are local. The packaged native prototypes automatically launch a reviewed installed Codex with a separate UI profile. They use its existing loopback startup debugger briefly, close and verify that listener, and leave installed files, signatures, and security fuses unchanged. The companion does not read credential files; the native Codex process uses its normal authentication services. The installed Codex application continues to use its own services, credentials, and policies when launched.

Settings and saved looks are JSON files; imported photos are stored locally. On POSIX systems, state directories are created with owner-only permissions, and new settings, image, and export files use owner-only permissions. On Windows, access follows the current user profile and inherited filesystem ACLs; POSIX mode bits do not establish a Windows ACL. Existing file permissions may differ. Profile contents are managed by the installed runtime.

Photos are re-encoded to JPEG with EXIF metadata removed. Portable look exports use a neutral photo filename, but contain the visible photo and the chosen look name. Inspect both before sharing. Clearing the current background keeps stored photos so saved looks still work.

Photo-derived colors are calculated locally. Included theme artwork is shipped with the companion and needs no download. Exported looks may also contain photo attribution text and its license; imported attribution is retained when re-exporting. Review that text along with the image before sharing.

Layout checks collect only visibility, pointer reachability, scroll geometry, and overflow measurements. They do not collect message text. A failed check records fixed failure codes in the existing local bridge diagnostic file.

The bridge does not record conversation/window titles. Local startup errors can contain paths. Explicit GUI diagnostics can capture the visible Codex window, including account or task information. Review and redact any diagnostic output before sharing it. The public bug template asks for a small setup report rather than account profiles or screenshots.

Public packages are built from an explicit manifest. Private runtime copies, profiles, photos, settings, logs, screenshots, environment files, development tool metadata, and Git metadata are not packaged. Archive user/group names are blank and numeric ownership is zero. The initial public Git history is created only from reviewed source and uses GitHub no-reply commit attribution.

Automated credential/path scans and manual inspection reduce disclosure risk; they do not prove that every possible sensitive detail has been detected. No private local diagnostics are attached to releases.
