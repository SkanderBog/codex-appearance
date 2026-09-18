#!/usr/bin/env python3
"""Read-only preflight. Output excludes usernames, paths, account data, and window titles."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

from paths import ROOT, storage_paths
from prepare import compatibility


def checks(headless=False):
    results = []
    def record(name, ok, message):
        results.append((name, ok, message))
    record('Python', sys.version_info >= (3, 10), f'Python {sys.version_info.major}.{sys.version_info.minor}; requires 3.10+.')
    try:
        from PIL import __version__ as pillow_version
        major = int(pillow_version.split('.')[0])
        record('Photos', major >= 9, f'Pillow {pillow_version}; requires 9.0+.')
    except ImportError:
        record('Photos', False, 'Install python3-pil (Pillow).')
    picker = bool(shutil.which('zenity'))
    record('File picker', picker, 'Zenity available.' if picker else 'Install Zenity for file import and export.')
    try:
        storage_paths()
        record('Storage configuration', True, 'Valid absolute storage paths.')
    except ValueError as error:
        record('Storage configuration', False, str(error))
    try:
        _, version, _, _, _ = compatibility(adaptive=os.environ.get('COMPANION_ADAPTIVE') == '1')
        record('Codex', True, f'Compatible build {version}.')
    except (OSError, ValueError, KeyError, TypeError):
        record('Codex', False, 'Missing or unsupported build. See compatibility.json and COMPANION_CODEX_INSTALL in README.md.')
    if not headless:
        record('Display', bool(os.environ.get('DISPLAY')), 'An X11 or XWayland graphical session is required (DISPLAY).')
    # Inspect helpers without executing privileged binaries. Namespace support is only a heuristic.
    probe = subprocess.run(['bash', '-c', 'source "$1"; companion_configure_sandbox; test -n "${CHROME_DEVEL_SANDBOX:-}"',
                            'doctor', str(ROOT / 'scripts/sandbox-env.sh')], capture_output=True)
    if probe.returncode == 0:
        record('Sandbox', True, 'An installed sandbox helper is configured; launch must still be tested.')
    elif Path('/proc/sys/kernel/apparmor_restrict_unprivileged_userns').exists() and Path('/proc/sys/kernel/apparmor_restrict_unprivileged_userns').read_text().strip() == '1':
        record('Sandbox', False, 'User namespaces are restricted and no helper was found. See README troubleshooting.')
    else:
        record('Sandbox', True, 'No known namespace restriction detected; launch must still be tested.')
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--headless', action='store_true', help='Skip the display check; this does not validate GUI behavior.')
    args = parser.parse_args()
    results = checks(args.headless)
    for name, ok, message in results:
        print(f'{"OK" if ok else "FAIL"}: {name}: {message}')
    return 0 if all(ok for _, ok, _ in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
