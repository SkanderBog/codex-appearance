#!/usr/bin/env python3
"""Build a native, self-contained photo decoder. Run on the target OS."""
import importlib.metadata
import pathlib
import shutil
import subprocess
import sys
import sysconfig
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = ROOT / 'dist' / 'native'
subprocess.run([
    sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
    '--name', 'photo-helper', '--distpath', str(BASE / 'helper'),
    '--workpath', str(BASE / 'pyinstaller-work'), '--specpath', str(BASE),
    str(ROOT / 'scripts' / 'prepare-photo.py'),
], check=True)
licenses = BASE / 'helper' / 'photo-helper' / 'licenses'
licenses.mkdir(exist_ok=True)
for package in ('Pillow', 'PyInstaller'):
    distribution = importlib.metadata.distribution(package)
    count = 0
    for file in distribution.files or []:
        if any(word in file.name.lower() for word in ('license', 'copying')):
            source = distribution.locate_file(file)
            if source.is_file():
                count += 1
                shutil.copyfile(source, licenses / f'{package}-{count}-{file.name}')
    if not count:
        raise RuntimeError(f'Missing distribution licenses for {package}')
candidates = [
    pathlib.Path(sys.base_prefix) / 'LICENSE.txt',
    pathlib.Path(sysconfig.get_path('stdlib')) / 'LICENSE.txt',
]
python_license = next((p for p in candidates if p.is_file()), None)
if python_license is None:
    # Some CI Python distributions omit this file. Retrieve the corresponding
    # CPython release's license, never a user document or a moving branch.
    version = '.'.join(map(str, sys.version_info[:3]))
    url = f'https://raw.githubusercontent.com/python/cpython/v{version}/LICENSE'
    with urllib.request.urlopen(url, timeout=30) as response:
        text = response.read(100_000).decode('utf-8')
    if 'PYTHON SOFTWARE FOUNDATION LICENSE' not in text:
        raise RuntimeError('The Python license download was not recognized.')
    (licenses / 'Python-LICENSE.txt').write_text(text, encoding='utf-8')
else:
    shutil.copyfile(python_license, licenses / 'Python-LICENSE.txt')
(licenses / 'NOTICE.txt').write_text(
    f'Python {sys.version.split()[0]}: Python Software Foundation License\n'
    f'Pillow {importlib.metadata.version("Pillow")}: HPND license; bundled codec notices accompany it\n'
    f'PyInstaller {importlib.metadata.version("PyInstaller")}: GPL with bootloader distribution exception\n'
    'Sources: https://github.com/python/cpython ; https://github.com/python-pillow/Pillow ; '
    'https://github.com/pyinstaller/pyinstaller\n', encoding='utf-8')
