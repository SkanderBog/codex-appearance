"""Public release boundaries: portability, compatibility rejection, and artifact privacy."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import paths
import prepare
import release


class PublicReleaseTests(unittest.TestCase):
    def test_paths_match_javascript_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix='appearance space ') as folder:
            env = dict(os.environ, COMPANION_STATE_DIR=folder + '/data space',
                       COMPANION_RUNTIME_DIR=folder + '/cache space', COMPANION_OUTPUT_DIR=folder + '/results')
            with patch.dict(os.environ, env):
                expected = list(map(str, paths.storage_paths()))
            output = subprocess.check_output(['node', '-e', "const p=require('./src/paths.cjs'); console.log(JSON.stringify([p.STATE,p.RUNTIME,p.OUTPUT]))"], cwd=ROOT, env=env)
            self.assertEqual(json.loads(output), expected)

    def test_relative_overrides_rejected(self):
        with patch.dict(os.environ, {'COMPANION_STATE_DIR': 'relative'}):
            with self.assertRaises(ValueError):
                paths.storage_paths()

    def test_fresh_install_uses_xdg_and_preserves_legacy(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'source'; root.mkdir()
            env = {k: v for k, v in os.environ.items() if not k.startswith('COMPANION_')}
            env.update(XDG_DATA_HOME=folder + '/data', XDG_CACHE_HOME=folder + '/cache')
            with patch.dict(os.environ, env, clear=True):
                self.assertEqual(paths.storage_paths(root)[0], Path(folder) / 'data/codex-appearance')
                (root / '.state').mkdir(); (root / '.state/appearance.json').write_text('{}')
                self.assertEqual(paths.storage_paths(root)[0], root / '.state')

    def test_unknown_codex_build_rejected_without_runtime_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            install = Path(folder); (install / 'resources').mkdir()
            (install / 'ChatGPT').write_bytes(b'fixture'); (install / 'ChatGPT').chmod(0o755)
            source = install / 'resources/app.asar'
            prepare.tiny_asar(source, {'package.json': json.dumps({'version': '0.0.0-unsupported'}).encode()})
            before = source.read_bytes()
            with self.assertRaisesRegex(ValueError, 'Unsupported Codex build'):
                prepare.compatibility(install)
            self.assertEqual(source.read_bytes(), before)
            self.assertFalse((install / '.runtime').exists())

    def test_release_manifest_excludes_private_data_and_archive_is_reproducible(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'package.json').write_text('{"version":"0.0.1-alpha.1"}')
            (root / 'launch.sh').write_text('#!/bin/bash\nexit 0\n')
            (root / 'release-files.txt').write_text('package.json\nlaunch.sh\nrelease-files.txt\n')
            (root / '.state').mkdir(); (root / '.state/private-photo.jpg').write_bytes(b'private')
            first = release.build(root).read_bytes()
            editor_archives = {p.name: p.read_bytes() for p in (root / 'dist').glob('*.zip')}
            archive = release.build(root)
            self.assertEqual(first, archive.read_bytes())
            self.assertEqual(len(editor_archives), 2)
            for name, data in editor_archives.items():
                file = root / 'dist' / name
                self.assertEqual(data, file.read_bytes())
                with zipfile.ZipFile(file) as zipped:
                    self.assertEqual(len(zipped.infolist()), 3)
                    for member in zipped.infolist():
                        self.assertNotIn('.state', member.filename)
                        if member.filename.endswith('/launch.sh'):
                            self.assertEqual(member.external_attr >> 16, 0o100755)
            self.assertEqual(len((root / 'dist/SHA256SUMS.txt').read_text().splitlines()), 3)
            with tarfile.open(archive) as tar:
                for item in tar.getmembers():
                    self.assertNotIn('.state', item.name)
                    self.assertEqual(item.uid, 0); self.assertEqual(item.uname, '')
            (root / 'release-files.txt').write_text('.state/private-photo.jpg\n')
            with self.assertRaisesRegex(ValueError, 'Forbidden'):
                release.audit(root)

    def test_symlink_and_secret_rejected_without_echoing_secret(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'link.txt').symlink_to('/etc/hostname')
            (root / 'release-files.txt').write_text('link.txt\n')
            with self.assertRaisesRegex(ValueError, 'Symlink'):
                release.audit(root)
        secret = b'gh' + b'p_' + b'A' * 36
        issues = release.scan_bytes('fixture', secret)
        self.assertTrue(issues); self.assertNotIn(secret.decode(), str(issues))

    def test_asar_out_of_bounds_entry_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'bad.asar'
            with file.open('wb') as stream:
                prepare.write_header(stream, {'files': {'bad': {'offset': '9999', 'size': 30}}})
            with self.assertRaises(ValueError):
                prepare.read_entry(file, 'bad')

    def test_installer_handles_spaces_and_uninstalls_only_own_shortcut(self):
        with tempfile.TemporaryDirectory(prefix='appearance install ') as folder:
            env = dict(os.environ, XDG_DATA_HOME=folder)
            # A clean extracted source has no generated launcher to begin with.
            import shutil
            root = Path(folder) / 'source space'; (root / 'scripts').mkdir(parents=True)
            shutil.copy(ROOT / 'scripts/install.py', root / 'scripts/install.py')
            command = [sys.executable, str(root / 'scripts/install.py')]
            subprocess.run(command, env=env, check=True, capture_output=True)
            launcher = Path(folder) / 'applications/codex-appearance-companion.desktop'
            self.assertIn('Exec="', launcher.read_text())
            subprocess.run(command + ['--uninstall'], env=env, check=True, capture_output=True)
            self.assertFalse(launcher.exists())
            launcher.write_text('Unrelated launcher')
            result = subprocess.run(command + ['--uninstall'], env=env, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(launcher.read_text(), 'Unrelated launcher')

    def test_dependency_install_has_no_runtime_lifecycle_hook(self):
        package = json.loads((ROOT / 'package.json').read_text())
        automatic = {'preinstall', 'install', 'postinstall', 'prepare', 'prepublish'}
        self.assertFalse(automatic.intersection(package['scripts']))
        self.assertIn('prepare-runtime', package['scripts'])
