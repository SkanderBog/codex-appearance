"""Regression checks for helper selection; no helper is ever executed."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class LauncherTests(unittest.TestCase):
    def probe(self, metadata, mode=0o4755):
        with tempfile.TemporaryDirectory(prefix='appearance-helper-check-') as folder:
            helper = Path(folder) / 'unused-test-helper'
            helper.write_text('This fixture is inspected, never executed.\n')
            helper.chmod(mode)
            env = {k: v for k, v in os.environ.items() if k != 'CHROME_DEVEL_SANDBOX'}
            # Simulate ownership as seen outside the tool's user namespace.
            script = '''source "$1"
companion_test_metadata="$3"
stat() { printf '%s\\n' "$companion_test_metadata"; }
companion_try_sandbox_helper "$2" || true
printf '%s' "${CHROME_DEVEL_SANDBOX:-}"
'''
            result = subprocess.run(['bash', '-c', script, 'test', str(ROOT / 'scripts/sandbox-env.sh'), str(helper), metadata], env=env, capture_output=True, text=True, check=True)
            return result.stdout == str(helper)

    def test_trusted_setuid_helper_is_selected(self):
        self.assertTrue(self.probe('0 4755'))

    def test_user_owned_helper_is_not_selected(self):
        self.assertFalse(self.probe('1000 4755'))

    def test_writable_helper_is_not_selected(self):
        self.assertFalse(self.probe('0 4775'))
        self.assertFalse(self.probe('0 4757'))

    def test_helper_without_setuid_is_not_selected(self):
        self.assertFalse(self.probe('0 0755', 0o755))

    def test_explicit_existing_configuration_is_preserved(self):
        script = 'source "$1"; export CHROME_DEVEL_SANDBOX=/existing/helper; companion_configure_sandbox; printf "%s" "$CHROME_DEVEL_SANDBOX"'
        result = subprocess.run(['bash', '-c', script, 'test', str(ROOT / 'scripts/sandbox-env.sh')], capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout, '/existing/helper')
