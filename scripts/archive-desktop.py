#!/usr/bin/env python3
"""Archive the already-tested native package, preserving macOS executable modes."""
import hashlib
import json
import pathlib
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = ROOT / 'dist' / 'native'
info = json.loads((BASE / 'package-info.json').read_text())
folder = pathlib.Path(info['folder'])
output = BASE / 'artifacts'
output.mkdir(exist_ok=True)
platform = 'macos' if info['platform'] == 'darwin' else 'windows'
archive = output / f'codex-appearance-{info["version"]}-{platform}-{info["arch"]}-prototype.zip'
if sys.platform == 'darwin':
    subprocess.run(['/usr/bin/ditto', '-c', '-k', '--keepParent',
                    str(folder / 'Codex Appearance.app'), str(archive)], check=True)
else:
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as packed:
        for file in sorted(folder.rglob('*')):
            if file.is_file():
                packed.write(file, pathlib.Path('Codex Appearance') / file.relative_to(folder))
digest = hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest()
(output / (archive.name + '.sha256')).write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
print(archive)
