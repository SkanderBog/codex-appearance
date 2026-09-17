"""Archive-boundary checks for downloaded CI fixtures; no network or account data."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile


SPEC = importlib.util.spec_from_file_location(
    'prepare_native_ci', Path(__file__).parents[1] / 'scripts/prepare-native-ci.py')
CI = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CI)


class NativeFixtureTests(unittest.TestCase):
    def test_rejects_paths_that_escape_native_extraction_directory(self):
        for name in ('../outside', '/outside', 'C:/outside', 'app\\..\\outside',
                     'app/file:stream'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                archive = Path(directory) / 'fixture.zip'
                with zipfile.ZipFile(archive, 'w') as stream:
                    stream.writestr(name, b'fixture')
                with self.assertRaises(ValueError):
                    CI.validate_zip(archive)

    def test_rejects_symlinks_before_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'fixture.zip'
            info = zipfile.ZipInfo('app/link')
            info.external_attr = 0o120777 << 16
            with zipfile.ZipFile(archive, 'w') as stream:
                stream.writestr(info, '../../outside')
            with self.assertRaises(ValueError):
                CI.validate_zip(archive)

    def test_accepts_msix_style_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'fixture.zip'
            with zipfile.ZipFile(archive, 'w') as stream:
                stream.writestr('app/resources/app.asar', b'fixture')
                stream.writestr('[Content_Types].xml', b'fixture')
            CI.validate_zip(archive)


if __name__ == '__main__':
    unittest.main()
