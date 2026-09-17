#!/usr/bin/env bash
# Keep desktop startup failures visible, even when no terminal is open.
set -u
umask 077
COMPANION_LAUNCH_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mapfile -d '' -t companion_paths < <("${COMPANION_PYTHON:-python3}" "$COMPANION_LAUNCH_ROOT/scripts/paths.py")
[[ ${#companion_paths[@]} == 3 ]] || exit 1
COMPANION_LAUNCH_LOG="${companion_paths[0]}/desktop-launch.log"
mkdir -p "${companion_paths[0]}" || exit 1
if [[ -f "$COMPANION_LAUNCH_LOG" ]] && (( $(stat -c '%s' "$COMPANION_LAUNCH_LOG") > 1048576 )); then
  mv -f "$COMPANION_LAUNCH_LOG" "$COMPANION_LAUNCH_LOG.previous"
fi
printf '\n[%s] Desktop launch\n' "$(date -Is)" >> "$COMPANION_LAUNCH_LOG"
source "$COMPANION_LAUNCH_ROOT/scripts/sandbox-env.sh"
companion_configure_sandbox
printf 'Sandbox helper: %s\n' "${CHROME_DEVEL_SANDBOX:-user-namespace default}" >> "$COMPANION_LAUNCH_LOG"
"$COMPANION_LAUNCH_ROOT/launch.sh" >> "$COMPANION_LAUNCH_LOG" 2>&1
COMPANION_LAUNCH_STATUS=$?
if (( COMPANION_LAUNCH_STATUS != 0 )); then
  printf 'Startup exited with status %s\n' "$COMPANION_LAUNCH_STATUS" >> "$COMPANION_LAUNCH_LOG"
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --no-markup --title='Codex Appearance could not start' \
      --text="The app could not start (exit $COMPANION_LAUNCH_STATUS).\n\nDetails were saved in:\n$COMPANION_LAUNCH_LOG" 2>/dev/null || true
  fi
fi
exit "$COMPANION_LAUNCH_STATUS"
