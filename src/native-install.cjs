'use strict';
// Read-only inspection. No installation files, signatures, or fuses are changed.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { STATE } = require('./paths.cjs');
const supported = require('../native-compatibility.json');
function readEntry(archive, name) {
  if (name.split('/').some((part) => !part || part === '.' || part === '..'))
    throw new Error('Invalid archive path.');
  const fd = fs.openSync(archive, 'r');
  try {
    const prefix = Buffer.alloc(16);
    if (fs.readSync(fd, prefix, 0, 16, 0) !== 16) throw new Error('Truncated Codex archive.');
    const headerSize = prefix.readUInt32LE(4),
      jsonSize = prefix.readUInt32LE(12),
      base = 8 + headerSize;
    if (
      prefix.readUInt32LE(0) !== 4 ||
      jsonSize > 32 * 1024 * 1024 ||
      headerSize !== 8 + jsonSize + ((4 - (jsonSize % 4)) % 4) ||
      prefix.readUInt32LE(8) !== headerSize - 4
    )
      throw new Error('Invalid Codex archive header.');
    const buffer = Buffer.alloc(jsonSize);
    if (fs.readSync(fd, buffer, 0, jsonSize, 16) !== jsonSize)
      throw new Error('Truncated Codex archive metadata.');
    let entry = JSON.parse(buffer);
    for (const part of name.split('/')) entry = entry.files?.[part];
    const offset = Number(entry?.offset),
      size = entry?.size;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > 128 * 1024 * 1024 ||
      entry.unpacked ||
      entry.link ||
      base + offset + size > fs.fstatSync(fd).size
    )
      throw new Error('Unsupported Codex archive entry.');
    const data = Buffer.alloc(size);
    if (fs.readSync(fd, data, 0, size, base + offset) !== size)
      throw new Error('Truncated Codex archive entry.');
    return data;
  } finally {
    fs.closeSync(fd);
  }
}
function inspectInstall(directory, platform = process.platform, arch = process.arch) {
  if (!path.isAbsolute(directory)) throw new Error('Choose an absolute Codex installation path.');
  const expected = supported[`${platform}-${arch}`];
  if (!expected) throw new Error(`This prototype does not support ${platform}-${arch}.`);
  if (platform === 'win32' && /\.exe$/i.test(directory)) directory = path.dirname(directory);
  const executable =
    platform === 'darwin'
      ? path.join(directory, 'Contents/MacOS/ChatGPT')
      : path.join(directory, 'ChatGPT.exe');
  const archive =
    platform === 'darwin'
      ? path.join(directory, 'Contents/Resources/app.asar')
      : path.join(directory, 'resources/app.asar');
  if (!fs.statSync(executable).isFile()) throw new Error('Codex executable was not found.');
  const pkg = JSON.parse(readEntry(archive, 'package.json'));
  const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
  if (
    pkg.version !== expected.version ||
    hash(readEntry(archive, expected.main)) !== expected.mainSha256 ||
    hash(readEntry(archive, pkg.main)) !== expected.earlyBootstrapSha256
  )
    throw new Error(
      `Codex ${pkg.version || 'unknown'} is not the reviewed ${expected.version} build. No installation files were changed.`,
    );
  return { directory, executable, archive, version: pkg.version };
}
function discoverInstall(platform = process.platform) {
  const candidates = [];
  if (process.env.COMPANION_CODEX_INSTALL) candidates.push(process.env.COMPANION_CODEX_INSTALL);
  try {
    candidates.push(
      JSON.parse(fs.readFileSync(path.join(STATE, 'native-install.json'), 'utf8')).directory,
    );
  } catch {}
  if (platform === 'darwin')
    for (const folder of ['/Applications', path.join(os.homedir(), 'Applications')])
      for (const name of ['ChatGPT.app', 'Codex.app']) candidates.push(path.join(folder, name));
  if (platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-AppxPackage -Name OpenAI.Codex | Select-Object -ExpandProperty InstallLocation',
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 65536 },
    );
    if (!result.error && result.status === 0)
      for (const folder of result.stdout.trim().split(/\r?\n/).filter(Boolean))
        candidates.push(path.join(folder, 'app'));
  }
  let failure;
  for (const candidate of candidates.filter((value) => typeof value === 'string' && value)) {
    try {
      return inspectInstall(candidate, platform);
    } catch (error) {
      if (fs.existsSync(candidate)) failure = error;
    }
  }
  throw failure || new Error('Install Codex, then use Locate Codex to choose its application.');
}
function rememberInstall(directory) {
  const installation = inspectInstall(directory);
  fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(STATE, 'native-install.json'),
    JSON.stringify({ directory: installation.directory }),
    { mode: 0o600 },
  );
  return installation;
}
module.exports = { readEntry, inspectInstall, discoverInstall, rememberInstall };
