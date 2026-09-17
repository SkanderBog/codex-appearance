#!/usr/bin/env python3
"""Fetch reviewed, signed native Codex fixtures for CI; never release these files.

The fixed digests deliberately reject a changed upstream 'latest' download.
Review the new native build before updating them. No user profile is accessed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import subprocess
import sys
import zipfile


PACKAGES = {
    'Darwin-arm64': {
        'url': 'https://persistent.oaistatic.com/codex-app-prod/Codex.dmg',
        'sha256': '61c33b667b4560e70c94d0c0275e0f408d8ae1c2b1cbf598434d1307af471516',
        'filename': 'reviewed-codex.dmg',
        'version': '26.911.61220',
    },
    'Windows-AMD64': {
        'url': 'https://persistent.oaistatic.com/codex-app-prod/ChatGPT-x64.msix',
        'sha256': '163f5c14ce376c98711396aacad34099df275ab67d5b0e76ee2b76ba5c13d7b9',
        'filename': 'reviewed-codex.msix',
        'version': '26.908.70816',
    },
}


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, timeout=300, **kwargs)
    if result.returncode:
        # These commands operate only on the fixed public CI fixture. Preserve
        # the native verifier's reason instead of hiding it behind an exit code.
        raise ValueError(f'{args[0]} failed: {(result.stderr or result.stdout)[-6000:].strip()}')
    return result


def validate_zip(path):
    """Check names before invoking the native Windows ZIP extractor."""
    total = 0
    with zipfile.ZipFile(path) as archive:
        for item in archive.infolist():
            name = item.filename.replace('\\', '/')
            parts = PurePosixPath(name).parts
            if (not parts or name.startswith('/') or '..' in parts
                    or any(':' in part for part in parts)
                    or (item.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError('Unsafe native fixture archive entry')
            total += item.file_size
            if total > 8 * 1024 ** 3:
                raise ValueError('Native fixture archive is unexpectedly large')


def powershell(script, env):
    return run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
               env={**os.environ, **env})


def verify_signature(install, system):
    if system == 'Darwin':
        run(['codesign', '--verify', '--deep', '--strict', str(install)])
        # The bundle identity applies to the outer app, not its nested helpers.
        run(['codesign', '--verify', '--strict', '-R',
             'anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2" '
             'and identifier "com.openai.codex"', str(install)])
    else:
        powershell(
            "$ErrorActionPreference = 'Stop'; "
            "$s = Get-AuthenticodeSignature -LiteralPath $env:COMPANION_CI_EXECUTABLE; "
            "if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'OpenAI') "
            "{ throw ('Native Codex signature: ' + $s.Status + '; ' + $s.StatusMessage + "
            "'; signer=' + $s.SignerCertificate.Subject) }",
            {'COMPANION_CI_EXECUTABLE': str(install / 'ChatGPT.exe')})


def protected_files(install, system):
    if system == 'Darwin':
        contents = install / 'Contents'
        frameworks = sorted((contents / 'Frameworks').glob(
            'Codex Framework.framework/Versions/*/Codex Framework'))
        frameworks = [p for p in frameworks if p.is_file() and 'Current' not in p.parts]
        if len(frameworks) != 1:
            raise ValueError('Unexpected native Mac framework layout')
        return [contents / 'Resources/app.asar', contents / 'MacOS/ChatGPT',
                contents / 'Info.plist', frameworks[0]]
    return [install / 'resources/app.asar', install / 'ChatGPT.exe', install / 'chrome.dll']


def snapshot(install, system):
    return {str(p.relative_to(install)): digest(p) for p in protected_files(install, system)}


def export_install(install):
    # Write only the CI-created installation path, never credentials or account paths.
    value = str(install)
    if '\n' in value or '\r' in value:
        raise ValueError('Invalid CI work path')
    if os.environ.get('GITHUB_ENV'):
        with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as stream:
            stream.write(f'COMPANION_CODEX_INSTALL={value}\n')
    print(json.dumps({'prepared': True, 'install': value, 'signatureVerified': True}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', required=True, type=Path)
    parser.add_argument('--verify-unchanged', action='store_true')
    args = parser.parse_args()
    system = platform.system()
    key = f'{system}-{platform.machine()}'
    if key not in PACKAGES:
        raise ValueError(f'No reviewed native Codex test package for {key}')
    work = args.work.resolve()
    work.mkdir(parents=True, exist_ok=True, mode=0o700)
    record = work / 'native-fixture-provenance.json'
    if args.verify_unchanged:
        previous = json.loads(record.read_text(encoding='utf-8'))
        install = work / previous['installRelative']
        if not install.resolve().is_relative_to(work):
            raise ValueError('Fixture installation escaped its CI work directory')
        verify_signature(install, system)
        if snapshot(install, system) != previous['files']:
            raise ValueError('Native Codex installation changed during the smoke test')
        print(json.dumps({'unchanged': True, 'signatureVerified': True,
                          'version': previous['version']}))
        return
    if record.exists():
        raise ValueError('Use a fresh CI work directory for native fixture preparation')
    package = PACKAGES[key]
    archive = work / package['filename']
    # curl handles the official CDN correctly on all CI hosts and needs no Python packages.
    run(['curl.exe' if system == 'Windows' else 'curl', '--fail', '--silent',
         '--show-error', '--location', '--retry', '2', '--max-time', '240',
         package['url'], '--output', str(archive)])
    if digest(archive) != package['sha256']:
        raise ValueError('Official native download changed; review and pin its new build first')
    if system == 'Darwin':
        mount = work / 'mounted'
        mount.mkdir()
        run(['hdiutil', 'attach', str(archive), '-readonly', '-nobrowse',
             '-mountpoint', str(mount)])
        try:
            apps = sorted(mount.glob('*.app'))
            if len(apps) != 1 or apps[0].name != 'ChatGPT.app':
                raise ValueError('Unexpected official Mac disk-image layout')
            install = work / 'ChatGPT.app'
            run(['ditto', str(apps[0]), str(install)])
        finally:
            run(['hdiutil', 'detach', str(mount)])
    else:
        validate_zip(archive)
        destination = work / 'unpacked'
        powershell(
            "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; "
            "[System.IO.Compression.ZipFile]::ExtractToDirectory($env:COMPANION_CI_ARCHIVE, "
            "$env:COMPANION_CI_DESTINATION)",
            {'COMPANION_CI_ARCHIVE': str(archive), 'COMPANION_CI_DESTINATION': str(destination)})
        install = destination / 'app'
    verify_signature(install, system)
    record.write_text(json.dumps({
        'platform': key, 'version': package['version'], 'packageSha256': package['sha256'],
        'installRelative': str(install.relative_to(work)), 'files': snapshot(install, system),
    }, indent=2) + '\n', encoding='utf-8')
    export_install(install)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'Native CI fixture: {error}', file=sys.stderr)
        sys.exit(1)
