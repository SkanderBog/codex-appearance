#!/usr/bin/env python3
"""Prepare local runtime copies; never download or modify the installed application."""
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import struct

from paths import ROOT, absolute_env, storage_paths

INSTALL = absolute_env('COMPANION_CODEX_INSTALL', '/usr/lib/chatgpt')
MAX_HEADER = 32 * 1024 * 1024
MAX_ENTRY = 128 * 1024 * 1024


def read_header(path):
    with open(path, 'rb') as stream:
        prefix = stream.read(16)
        if len(prefix) != 16:
            raise ValueError('Truncated ASAR header')
        size, header_size, payload_size, json_size = struct.unpack('<4I', prefix)
        base = 8 + header_size
        if (size != 4 or json_size > MAX_HEADER or header_size > MAX_HEADER + 12
                or header_size != 8 + json_size + (-json_size % 4)
                or payload_size != header_size - 4 or base > path.stat().st_size):
            raise ValueError('Invalid ASAR header')
        data = stream.read(json_size)
        if len(data) != json_size:
            raise ValueError('Truncated ASAR metadata')
        header = json.loads(data)
        if not isinstance(header, dict) or not isinstance(header.get('files'), dict):
            raise ValueError('Invalid ASAR file table')
        return header, base


def entry(header, name):
    if not isinstance(name, str) or any(p in ('', '.', '..') for p in name.split('/')):
        raise ValueError('Invalid ASAR entry name')
    item = header
    for part in name.split('/'):
        item = item['files'][part]
    return item


def read_entry(path, name):
    header, base = read_header(path)
    item = entry(header, name)
    offset, size = int(item['offset']), item['size']
    if (not isinstance(size, int) or size < 0 or size > MAX_ENTRY or offset < 0
            or base + offset + size > path.stat().st_size or item.get('unpacked')):
        raise ValueError('Invalid or unsupported ASAR entry')
    with open(path, 'rb') as stream:
        stream.seek(base + offset)
        data = stream.read(size)
    if len(data) != size:
        raise ValueError('Truncated ASAR entry')
    return data


def write_header(stream, header):
    data = json.dumps(header, separators=(',', ':'), ensure_ascii=False).encode()
    padding = -len(data) % 4
    header_size = 8 + len(data) + padding
    stream.write(struct.pack('<4I', 4, header_size, header_size - 4, len(data)))
    stream.write(data + b'\0' * padding)


def integrity(data):
    size = 4 * 1024 * 1024
    return {'algorithm': 'SHA256', 'hash': hashlib.sha256(data).hexdigest(),
            'blockSize': size, 'blocks': [hashlib.sha256(data[i:i+size]).hexdigest()
                                       for i in range(0, len(data), size)]}


def patch_asar(source, destination, hook, extra=None):
    header, base = read_header(source)
    package = json.loads(read_entry(source, 'package.json'))
    main = package['main']
    original = read_entry(source, main)
    changed = ('require(' + json.dumps(str(hook)) + ');\n').encode() + original
    header = copy.deepcopy(header)
    changes = {main: changed, **(extra or {})}
    offset = source.stat().st_size - base
    for name, data in changes.items():
        target = entry(header, name)
        target.update(size=len(data), offset=str(offset), integrity=integrity(data))
        offset += len(data)
    temporary = destination.with_suffix('.tmp')
    with open(temporary, 'wb') as out, open(source, 'rb') as inp:
        write_header(out, header)
        inp.seek(base)
        shutil.copyfileobj(inp, out)
        for data in changes.values():
            out.write(data)
    temporary.replace(destination)
    return package['version']


def tiny_asar(destination, files):
    header = {'files': {}}
    offset = 0
    for name, data in files.items():
        header['files'][name] = {'size': len(data), 'offset': str(offset), 'integrity': integrity(data)}
        offset += len(data)
    temporary = destination.with_suffix('.tmp')
    with open(temporary, 'wb') as out:
        write_header(out, header)
        for data in files.values():
            out.write(data)
    temporary.replace(destination)


def compatibility(install=INSTALL, adaptive=False):
    """Return the inspected entry point, or reject builds before modifying a runtime copy."""
    supported = json.loads((ROOT / 'compatibility.json').read_text())
    if platform.system().lower() != supported['platform'] or platform.machine() != supported['architecture']:
        raise ValueError('This alpha supports Linux x86_64 only.')
    source = install / 'resources/app.asar'
    if not source.is_file() or not os.access(install / 'ChatGPT', os.X_OK):
        raise ValueError('Compatible Codex installation not found. Set COMPANION_CODEX_INSTALL to its directory.')
    package = json.loads(read_entry(source, 'package.json'))
    version = package.get('version')
    if not isinstance(version, str) or not re.fullmatch(
        r'[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[-+][0-9A-Za-z.-]+)?', version
    ):
        raise ValueError(f'Unsupported Codex package version {version!r}. No patch was applied.')
    expected = supported['builds'].get(version)
    if not adaptive and not expected:
        raise ValueError(f'Unsupported Codex build {version!r}. Supported: {", ".join(supported["builds"])}. No patch was applied.')
    header, _ = read_header(source)
    builds = header['files']['.vite']['files']['build']['files']
    candidates = [n for n in builds if n.startswith('main-') and n.endswith('.js')]
    if len(candidates) != 1:
        raise ValueError('Unfamiliar Codex entry point. No patch was applied.')
    main_path = '.vite/build/' + candidates[0]
    contents = read_entry(source, main_path)
    pattern = re.compile(rb'new\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*BrowserWindow\s*\(')
    if adaptive:
        if not pattern.search(contents):
            raise ValueError('This Codex entry point does not expose a recognizable BrowserWindow constructor. No patch was applied.')
        return source, version, main_path, contents, True
    if (hashlib.sha256(contents).hexdigest() != expected['mainSha256']
            or contents.count(b'new l.BrowserWindow(') != expected['windowConstructors']):
        raise ValueError('Codex build fingerprint does not match the tested integration. No patch was applied.')
    return source, version, main_path, contents, False


def link(source, destination):
    if destination.is_symlink():
        if destination.resolve() == source.resolve():
            return
        destination.unlink()
    elif destination.exists():
        raise ValueError('Unexpected file in runtime cache. Close styled windows and remove the cache before retrying.')
    destination.symlink_to(source, target_is_directory=source.is_dir())


def prepare():
    adaptive = os.environ.get('COMPANION_ADAPTIVE') == '1'
    source, version, main_path, contents, adaptive = compatibility(adaptive=adaptive)
    _, runtime, _ = storage_paths()
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(runtime / 'prepare.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        _prepare_locked(runtime, source, version, main_path, contents, adaptive)
    print('Private runtime ready; installed Codex files are unchanged.')


def _prepare_locked(runtime, source, version, main_path, contents, adaptive=False):
    binary = runtime / 'ChatGPT'
    installed = INSTALL / 'ChatGPT'
    if (not binary.exists() or binary.stat().st_size != installed.stat().st_size
            or binary.stat().st_mtime_ns != installed.stat().st_mtime_ns):
        staged = runtime / 'ChatGPT.next'
        shutil.copy2(installed, staged)
        staged.replace(binary)
    for flavor in ['companion', 'codex']:
        directory = runtime / flavor
        resources = directory / 'resources'
        resources.mkdir(parents=True, exist_ok=True, mode=0o700)
        local_binary = directory / 'ChatGPT'
        if local_binary.exists() and not os.path.samefile(local_binary, binary):
            local_binary.unlink()
        if not local_binary.exists():
            os.link(binary, local_binary)
        for item in INSTALL.iterdir():
            if item.name not in ['ChatGPT', 'resources']:
                link(item, directory / item.name)
        for item in (INSTALL / 'resources').iterdir():
            if item.name != 'app.asar':
                link(item, resources / item.name)
    manifest = json.loads((ROOT / 'package.json').read_text())
    tiny_asar(runtime / 'companion/resources/app.asar', {
        'package.json': json.dumps({'name': manifest['name'], 'version': manifest['version'], 'main': 'main.cjs'}).encode(),
        'main.cjs': ('require(' + json.dumps(str(ROOT / 'src/main.cjs')) + ');').encode()
    })
    metadata_path = runtime / 'source.json'
    fingerprint = {'path': str(source), 'size': source.stat().st_size, 'mtime': source.stat().st_mtime_ns,
                   'hook': str(ROOT / 'src/codex-hook.cjs'), 'patchVersion': 4, 'adaptive': adaptive}
    try:
        prior = json.loads(metadata_path.read_text())
    except (OSError, ValueError):
        prior = {}
    if prior.get('source') != fingerprint or not (runtime / 'codex/resources/app.asar').exists():
        constructor = ('new (require(' + json.dumps(str(ROOT / 'src/codex-hook.cjs')) + ').StyledWindow)(').encode()
        if adaptive:
            pattern = re.compile(rb'new\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*BrowserWindow\s*\(')
            changed, count = pattern.subn(lambda _match: constructor, contents)
            if count == 0:
                raise ValueError('Adaptive Codex preparation found no BrowserWindow constructors to patch.')
        else:
            changed = contents.replace(b'new l.BrowserWindow(', constructor)
        changes = {main_path: changed}
        patch_asar(source, runtime / 'codex/resources/app.asar', ROOT / 'src/codex-hook.cjs', changes)
        temporary = metadata_path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'source': fingerprint, 'version': version}, indent=2))
        temporary.replace(metadata_path)


if __name__ == '__main__':
    os.umask(0o077)
    try:
        prepare()
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise SystemExit(f'Preparation failed: {error}')
