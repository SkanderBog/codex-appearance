#!/usr/bin/env bash
# Ubuntu permits the installed Codex path to create user namespaces, but not a
# private executable in the user's project folder. Chromium supports using an
# already-installed, root-owned setuid sandbox helper for this case.
# Do not disable the browser sandbox or change the machine's AppArmor settings.
companion_try_sandbox_helper() {
  local companion_helper="$1" companion_owner companion_permissions
  [[ -f "$companion_helper" && -x "$companion_helper" && -u "$companion_helper" ]] || return 1
  read -r companion_owner companion_permissions < <(stat -Lc '%u %a' "$companion_helper" 2>/dev/null) || return 1
  [[ "$companion_owner" == 0 && "$companion_permissions" =~ ^[0-7]{3,4}$ ]] || return 1
  # A privileged helper must not be writable by its group or other users.
  (( (8#$companion_permissions & 0022) == 0 )) || return 1
  export CHROME_DEVEL_SANDBOX="$companion_helper"
}
companion_configure_sandbox() {
  [[ -n "${CHROME_DEVEL_SANDBOX:-}" ]] && return 0
  local companion_helper
  for companion_helper in \
    /opt/google/chrome/chrome-sandbox \
    /opt/google/chrome-beta/chrome-sandbox \
    /opt/brave.com/brave/chrome-sandbox \
    /usr/lib/chromium/chrome-sandbox; do
    if companion_try_sandbox_helper "$companion_helper"; then return 0; fi
  done
  return 0
}
