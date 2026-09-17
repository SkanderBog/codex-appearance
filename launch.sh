#!/usr/bin/env bash
set -euo pipefail
umask 077
COMPANION_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPANION_PYTHON="${COMPANION_PYTHON:-python3}"
COMPANION_MODE="${1:-companion}"
export COMPANION_ROOT COMPANION_PYTHON COMPANION_MODE
case "$COMPANION_MODE" in
  doctor) exec "$COMPANION_PYTHON" "$COMPANION_ROOT/scripts/doctor.py" ;;
  companion|self-test|codex-test|codex) ;;
  *) echo 'Usage: ./launch.sh [doctor|companion|codex-test|codex|self-test]' >&2; exit 2 ;;
esac
source "$COMPANION_ROOT/scripts/sandbox-env.sh"
companion_configure_sandbox
"$COMPANION_PYTHON" "$COMPANION_ROOT/scripts/doctor.py" >/dev/null || {
  "$COMPANION_PYTHON" "$COMPANION_ROOT/scripts/doctor.py"
  exit 1
}
mapfile -d '' -t companion_paths < <("$COMPANION_PYTHON" "$COMPANION_ROOT/scripts/paths.py")
[[ ${#companion_paths[@]} == 3 ]] || exit 1
export COMPANION_STATE_DIR="${companion_paths[0]}"
export COMPANION_RUNTIME_DIR="${companion_paths[1]}"
export COMPANION_OUTPUT_DIR="${companion_paths[2]}"
mkdir -p "$COMPANION_STATE_DIR"
"$COMPANION_PYTHON" "$COMPANION_ROOT/scripts/prepare.py" >/dev/null
case "$COMPANION_MODE" in
  companion|self-test)
    exec "$COMPANION_RUNTIME_DIR/companion/ChatGPT" --user-data-dir="$COMPANION_STATE_DIR/companion-profile" --ozone-platform=x11 ;;
  codex-test)
    export CODEX_ELECTRON_USER_DATA_PATH="$COMPANION_STATE_DIR/codex-test-profile"
    exec "$COMPANION_RUNTIME_DIR/codex/ChatGPT" --user-data-dir="$COMPANION_STATE_DIR/codex-test-profile" --ozone-platform=x11 ;;
  codex)
    exec "$COMPANION_RUNTIME_DIR/codex/ChatGPT" --ozone-platform=x11 ;;
esac
