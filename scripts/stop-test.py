#!/usr/bin/env python3
"""Close only the private test/companion processes launched from this project."""
import os
from pathlib import Path
import signal
import sys
from paths import storage_paths
state, runtime, _ = storage_paths()
mode = sys.argv[1] if len(sys.argv) > 1 else 'codex'
if mode not in ['codex', 'companion']:
    raise SystemExit('Expected codex or companion')
exe = runtime / mode / 'ChatGPT'
profile = str(state / ('codex-test-profile' if mode == 'codex' else 'companion-profile')).encode()
for proc in Path('/proc').iterdir():
    if not proc.name.isdigit():
        continue
    try:
        args = (proc / 'cmdline').read_bytes().split(b'\0')
        if (proc / 'exe').resolve() == exe and b'--user-data-dir=' + profile in args and not any(a.startswith(b'--type=') for a in args):
            os.kill(int(proc.name), signal.SIGTERM)
            print(f'Closed private {mode} process {proc.name}')
    except OSError:
        pass
