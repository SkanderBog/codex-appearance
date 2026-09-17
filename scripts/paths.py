"""Shared native storage paths. No directories are created by importing this module."""
import hashlib
import os
from pathlib import Path
import sys
import platform

ROOT = Path(__file__).resolve().parents[1]


def absolute_env(name, fallback):
    value = Path(os.environ.get(name) or fallback)
    if not value.is_absolute():
        raise ValueError(f'{name} must be an absolute path.')
    return value


def storage_paths(root=ROOT):
    if platform.system() == 'Darwin':
        data, cache = Path.home() / 'Library/Application Support', Path.home() / 'Library/Caches'
    elif platform.system() == 'Windows':
        data = absolute_env('LOCALAPPDATA', Path.home() / 'AppData/Local')
        cache = data / 'Cache'
    else:
        data = absolute_env('XDG_DATA_HOME', Path.home() / '.local/share')
        cache = absolute_env('XDG_CACHE_HOME', Path.home() / '.cache')
    # Keep existing local users' settings in place; new installs use XDG storage.
    legacy = root / '.state'
    default_state = legacy if (legacy / 'appearance.json').is_file() else data / 'codex-appearance'
    state = absolute_env('COMPANION_STATE_DIR', default_state)
    install_id = hashlib.sha256(str(root).encode()).hexdigest()[:12]
    runtime = absolute_env('COMPANION_RUNTIME_DIR', cache / 'codex-appearance' / install_id)
    output = absolute_env('COMPANION_OUTPUT_DIR', state / 'diagnostics')
    return state, runtime, output


if __name__ == '__main__':
    try:
        sys.stdout.buffer.write(b'\0'.join(os.fsencode(p) for p in storage_paths()) + b'\0')
    except ValueError as error:
        raise SystemExit(str(error))
