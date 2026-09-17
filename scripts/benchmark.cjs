'use strict';
// A repeatable CPU workload, not a benchmark of total Codex resource usage.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-benchmark-'));
process.env.COMPANION_STATE_DIR = directory;
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = fs.readFileSync;
try {
  const core = require(path.join(root, 'src/core.cjs'));
  fs.mkdirSync(core.ASSETS);
  const id = 'a'.repeat(64) + '.jpg',
    file = path.join(core.ASSETS, id);
  fs.copyFileSync(path.join(root, 'assets/themes/workbench.jpg'), file);
  let photoReads = 0,
    serializedBytes = 0;
  fs.readFileSync = function (name, ...args) {
    if (name === file) photoReads++;
    return read.call(this, name, ...args);
  };
  const start = process.cpuUsage(),
    wall = performance.now();
  for (let i = 0; i < 400; i++) {
    const settings = core.normalize({ backgroundMode: 'photo', photo: id, photoBlur: i % 20 });
    serializedBytes += JSON.stringify({
      settings,
      previewCSS: core.cssFor(settings, { embedded: true }),
      photoData: core.assetDataURL(id),
    }).length;
  }
  const cpu = process.cpuUsage(start);
  console.log(
    JSON.stringify(
      {
        snapshots: 400,
        photoReads,
        cpuMs: (cpu.user + cpu.system) / 1000,
        wallMs: performance.now() - wall,
        serializedBytes,
      },
      null,
      2,
    ),
  );
} finally {
  fs.readFileSync = read;
  fs.rmSync(directory, { recursive: true, force: true });
}
