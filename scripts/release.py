#!/usr/bin/env python3
"""Audit an explicit source manifest and build a reproducible, source-only Linux alpha."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = {'.git', '.codex', '.agents', '.runtime', '.state', 'work', 'outputs',
             'dist', 'node_modules', '__pycache__', '.env', 'auth.json'}
PATTERNS = {
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'GitHub token': rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})',
    'provider key': rb'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}',
    'AWS access key': rb'AKIA[0-9A-Z]{16}',
    'machine home path': rb'(?:/home|/Users)/[A-Za-z0-9_.-]+/',
    'email address': rb'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
}


def manifest(root=ROOT):
    names = (root / 'release-files.txt').read_text().splitlines()
    if not names or len(names) != len(set(names)):
        raise ValueError('Release manifest is empty or contains duplicates.')
    for name in names:
        path = PurePosixPath(name)
        if (path.is_absolute() or '..' in path.parts or str(path) != name
                or FORBIDDEN.intersection(path.parts) or name.endswith(('.log', '.asar', '.pyc'))):
            raise ValueError(f'Forbidden release path: {name}')
        file = root / name
        if any(parent.is_symlink() for parent in [file, *file.parents] if parent != root.parent):
            raise ValueError(f'Symlink in release path: {name}')
        if not file.is_file():
            raise ValueError(f'Missing release file: {name}')
    return sorted(names)


def scan_bytes(name, data, deny=()):
    failures = []
    for label, pattern in PATTERNS.items():
        # Report only the file and category, never the matched secret.
        if re.search(pattern, data):
            failures.append(f'{name}: possible {label}')
    for literal in deny:
        if literal and literal.lower().encode() in data.lower():
            failures.append(f'{name}: private literal')
    return failures


def audit(root=ROOT, deny=()):
    names = manifest(root)
    failures = []
    for name in names:
        data = (root / name).read_bytes()
        failures.extend(scan_bytes(name, data, deny))
        if name.endswith(('.png', '.webp', '.jpg', '.jpeg')):
            from PIL import Image
            with Image.open(io.BytesIO(data)) as image:
                if image.getexif() or any(k.lower() in {'xmp', 'comment', 'description', 'author', 'exif'} for k in image.info):
                    failures.append(f'{name}: image metadata needs review')
    if failures:
        raise ValueError('\n'.join(failures))
    return names


def audit_git(root, names, deny=()):
    def git(*args):
        return subprocess.check_output(['git', '-C', str(root), *args])
    tracked = set(git('ls-files', '-z').decode().strip('\0').split('\0'))
    if tracked != set(names):
        raise ValueError('Git index differs from the reviewed release manifest.')
    failures = []
    for row in git('rev-list', '--objects', '--all').splitlines():
        oid = row.split(b' ', 1)[0].decode()
        kind = git('cat-file', '-t', oid).strip()
        if kind in (b'blob', b'commit', b'tag'):
            data = git('cat-file', '-p', oid)
            # GitHub no-reply addresses are intentional public attribution.
            if kind in (b'commit', b'tag'):
                data = re.sub(rb'[0-9]+\+[A-Za-z0-9-]+@users\.noreply\.github\.com', b'public-attribution', data)
            failures.extend(scan_bytes('Git object ' + oid[:12], data, deny))
    if failures:
        raise ValueError('\n'.join(failures))


def build(root=ROOT, names=None):
    names = names or audit(root)
    version = json.loads((root / 'package.json').read_text())['version']
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.]+)?', version):
        raise ValueError('Invalid release version.')
    prefix = f'codex-appearance-{version}-linux-x64'
    dist = root / 'dist'
    dist.mkdir(exist_ok=True)
    archive = dist / (prefix + '.tar.gz')
    with archive.open('wb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name in names:
                data = (root / name).read_bytes()
                info = tarfile.TarInfo(prefix + '/' + name)
                info.size = len(data)
                info.mode = 0o755 if name.endswith('.sh') else 0o644
                info.mtime = info.uid = info.gid = 0
                info.uname = info.gname = ''
                tar.addfile(info, io.BytesIO(data))
    # Inspect the final archive, not only its input list.
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        if [m.name for m in members] != [prefix + '/' + n for n in names]:
            raise ValueError('Archive manifest mismatch.')
        for member, name in zip(members, names):
            if not member.isfile() or tar.extractfile(member).read() != (root / name).read_bytes():
                raise ValueError('Archive content mismatch.')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (dist / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n')
    return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Audit without building.')
    parser.add_argument('--git', action='store_true', help='Also audit tracked paths and all reachable history.')
    parser.add_argument('--deny-literal', action='append', default=[], help='Additional local private string; never printed.')
    args = parser.parse_args()
    try:
        names = audit(deny=args.deny_literal)
        if args.git:
            audit_git(ROOT, names, args.deny_literal)
        print(f'Audit passed for {len(names)} allowlisted source files. Review content manually before publishing.')
        if not args.check:
            print(build(names=names).name)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))


if __name__ == '__main__':
    main()
