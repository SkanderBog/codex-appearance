import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).resolve().parents[1] / 'scripts/prepare.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class ArchiveTests(unittest.TestCase):
    def test_patch_preserves_original_archive_and_unrelated_payloads(self):
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder) / 'source.asar', Path(folder) / 'copy.asar'
            files = {'package.json': json.dumps({'main': 'main.js', 'version': 'test'}).encode(),
                     'main.js': b'console.log("original");', 'asset.txt': b'unchanged\0asset'}
            prepare.tiny_asar(source, files)
            before = source.read_bytes()
            prepare.patch_asar(source, target, Path('/local/appearance.cjs'))
            self.assertEqual(source.read_bytes(), before)
            self.assertEqual(prepare.read_entry(target, 'asset.txt'), files['asset.txt'])
            self.assertEqual(prepare.read_entry(target, 'package.json'), files['package.json'])
            changed = prepare.read_entry(target, 'main.js')
            self.assertEqual(changed, b'require("/local/appearance.cjs");\n' + files['main.js'])
            header, _ = prepare.read_header(target)
            self.assertEqual(prepare.entry(header, 'main.js')['integrity'], prepare.integrity(changed))

    def test_invalid_header_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'invalid.asar'
            path.write_bytes(b'not an archive')
            with self.assertRaises(ValueError): prepare.read_header(path)
