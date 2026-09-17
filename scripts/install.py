#!/usr/bin/env python3
"""Install this app's user-level menu launcher and an optional desktop shortcut."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--uninstall', action='store_true', help='Remove the launcher; keep settings and photos.')
parser.add_argument('--desktop', action='store_true', help='Also create or remove a shortcut on your desktop.')
args = parser.parse_args()
data = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share')))
if not data.is_absolute():
    raise SystemExit('XDG_DATA_HOME must be an absolute path.')
applications = data / 'applications'
launcher = applications / 'codex-appearance-companion.desktop'
desktop_launcher = None
if args.desktop:
    if not shutil.which('xdg-user-dir'):
        raise SystemExit('Desktop location could not be found: xdg-user-dir is missing.')
    desktop = Path(subprocess.check_output(['xdg-user-dir', 'DESKTOP'], text=True).strip())
    if not desktop.is_absolute() or desktop == Path.home() or not desktop.is_dir():
        raise SystemExit('No separate desktop directory is configured. The existing launcher was left unchanged.')
    desktop_launcher = desktop / 'Codex Appearance.desktop'
targets = [launcher] + ([desktop_launcher] if desktop_launcher else [])
for target in targets:
    if target.exists() and not any(str(p) in target.read_text() for p in [ROOT / 'launch.sh', ROOT / 'scripts/desktop-launch.sh']):
        raise SystemExit(f'Launcher belongs to another installation; left unchanged: {target}')
if args.uninstall:
    for target in targets:
        if target.exists():
            target.unlink()
    print('Requested shortcuts removed. Your settings and photos were kept.')
else:
    def quote(value):
        return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%') + '"'
    text = '\n'.join([
        '[Desktop Entry]', 'Type=Application', 'Version=1.0', 'Name=Codex Appearance',
        'Comment=Personal colors, photo backgrounds, and terminal layout for Codex',
        'Exec=' + quote(ROOT / 'scripts/desktop-launch.sh'), 'Path=' + str(ROOT),
        'Icon=' + str(ROOT / 'assets/icon.svg'), 'Terminal=false',
        'Categories=Settings;', 'Keywords=Codex;Theme;Appearance;Background;Transparency;',
        'StartupNotify=true', 'StartupWMClass=codex-appearance-companion', '',
    ])
    applications.mkdir(parents=True, exist_ok=True)
    for target in targets:
        temporary = target.with_suffix('.desktop.tmp')
        temporary.write_text(text)
        temporary.chmod(0o755)
        temporary.replace(target)
    (ROOT / 'Start Companion.desktop').write_text(text)
    (ROOT / 'Start Companion.desktop').chmod(0o755)
    print(f'Installed Codex Appearance: {launcher}')
    if desktop_launcher:
        print(f'Desktop shortcut: {desktop_launcher}')
        if shutil.which('gio'):
            trusted = subprocess.run(['gio', 'set', str(desktop_launcher), 'metadata::trusted', 'true'], capture_output=True, text=True)
            if trusted.returncode:
                print('Your desktop may require right-clicking the shortcut and selecting Allow Launching.')
if shutil.which('update-desktop-database'):
    subprocess.run(['update-desktop-database', str(applications)], check=False)
