'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  normalize,
  cssFor,
  PRESETS,
  DEFAULTS,
  themeString,
  assetDataURL,
  paletteFor,
} = require('../src/core.cjs');
const { decodeBase64, importLook, imageFormat, exportLook } = require('../src/library.cjs');
test('Untrusted settings cannot inject CSS or local file paths', () => {
  const s = normalize({
    preset: '__proto__',
    opacity: Infinity,
    fontSize: -100,
    font: 'x;url()',
    foreground: '#fff;background:red',
    photo: '../../auth.json',
    photoFit: 'url(https://evil)',
    terminalMode: 'false',
    backgroundMode: '__proto__',
  });
  assert.equal(s.preset, 'graphite');
  assert.equal(s.opacity, 0.82);
  assert.equal(s.fontSize, 11);
  assert.equal(s.font, 'mono');
  assert.equal(s.foreground, DEFAULTS.foreground);
  assert.equal(s.photo, '');
  assert.equal(s.photoFit, 'cover');
  assert.equal(s.backgroundMode, 'solid');
  assert.equal(s.terminalMode, true);
  assert.equal(assetDataURL('../../auth.json'), '');
  assert.doesNotThrow(() => normalize(null));
  assert.doesNotThrow(() => normalize([]));
});
test('Version one settings migrate without losing preferences', () => {
  const s = normalize({
    version: 1,
    preset: 'amber',
    opacity: 0.6,
    fontSize: 17,
    terminalMode: false,
    enabled: false,
  });
  assert.equal(s.version, 2);
  assert.equal(s.preset, 'amber');
  assert.equal(s.opacity, 0.6);
  assert.equal(s.fontSize, 17);
  assert.equal(s.enabled, false);
  assert.equal(s.terminalMode, false);
  assert.equal(s.backgroundMode, 'solid');
});
test('All numeric settings are bounded', () => {
  const s = normalize({
    opacity: 4,
    fontSize: 999,
    codeSize: -5,
    photoTint: -1,
    photoBlur: 500,
    photoX: 400,
    photoY: -5,
    lineHeight: 50,
    gradientAngle: 600,
  });
  assert.equal(s.opacity, 1);
  assert.equal(s.fontSize, 26);
  assert.equal(s.codeSize, 10);
  assert.equal(s.photoTint, 0);
  assert.equal(s.photoBlur, 24);
  assert.equal(s.photoX, 100);
  assert.equal(s.photoY, 0);
  assert.equal(s.lineHeight, 2);
  assert.equal(s.gradientAngle, 360);
});
test('All sixteen solid palettes keep alpha out of the text tree', () => {
  assert.equal(Object.keys(PRESETS).length, 16);
  for (const preset of Object.keys(PRESETS)) {
    const css = cssFor({ preset, opacity: 0.6 }, { codex: true });
    assert.match(css, /rgba\([^)]*, 0\.6\)/);
    assert.doesNotMatch(css, /(?:^|[;{}\s])opacity\s*:/);
    assert.match(css, /\[role="dialog"\]/);
  }
});
test('Gradient opacity belongs only to a non-interactive background layer', () => {
  const css = cssFor(
    { backgroundMode: 'gradient', opacity: 0.6, gradientAngle: 60, gradientColor: '#AABBCC' },
    { codex: true },
  );
  assert.match(css, /body::before \{[^}]*pointer-events:none;[^}]*linear-gradient\(60deg/);
  assert.match(css, /body::before \{[^}]*opacity:0.6/);
  assert.equal((css.match(/\bopacity:/g) || []).length, 1);
});
test('Missing photo falls back to the palette', () => {
  assert.match(cssFor({ backgroundMode: 'photo', photo: 'a'.repeat(64) + '.jpg' }), /rgba\(/);
  assert.doesNotMatch(cssFor({ backgroundMode: 'photo' }), /url\(/);
});
test('Custom colors and installed fonts export correctly', () => {
  const s = {
    preset: 'amber',
    customColors: true,
    background: '#112233',
    foreground: '#ddeeff',
    accent: '#abcdef',
    font: 'liberation',
  };
  assert.equal(paletteFor(s).foreground, '#DDEEFF');
  const share = themeString(s);
  assert.ok(share.startsWith('codex-theme-v1:'));
  const data = JSON.parse(share.slice(15));
  assert.equal(data.theme.surface, '#112233');
  assert.equal(data.theme.fonts.ui, 'Liberation Mono');
});
test('Disabling removes every Codex style; sidebar remains available', () => {
  assert.equal(cssFor({ enabled: false }, { codex: true }), '');
  assert.doesNotMatch(cssFor({ terminalMode: false }, { codex: true }), /display: none/);
});
test('Import rejects malformed, oversized and path-only image references', () => {
  assert.throws(() => decodeBase64('%%%'));
  assert.throws(() => decodeBase64('a'.repeat(30 * 1024 * 1024)));
  assert.throws(() => importLook('{', {}));
  assert.throws(() => importLook('{"format":"wrong"}', {}));
  const fake = {
    format: 'codex-appearance-look',
    version: 1,
    settings: { photo: 'a'.repeat(64) + '.jpg' },
    name: 'Imported',
  };
  assert.equal(importLook(JSON.stringify(fake), {}).settings.photo, '');
  fake.photo = 'file:///etc/passwd';
  assert.throws(() => importLook(JSON.stringify(fake), {}));
});
test('Image type is determined by bytes, not a misleading file extension', () => {
  assert.equal(imageFormat(Buffer.from('<svg></svg>')), '');
  assert.equal(imageFormat(Buffer.from([255, 216, 255, 0])), 'jpeg');
  assert.equal(imageFormat(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'png');
});
test('Portable look round-trips without a photo', () => {
  const exported = exportLook('Test', { preset: 'forest', font: 'serif', contentWidth: 'full' }),
    imported = importLook(exported, {});
  assert.equal(imported.name, 'Test');
  assert.equal(imported.settings.preset, 'forest');
  assert.equal(imported.settings.font, 'serif');
  assert.equal(imported.settings.contentWidth, 'full');
});

test('Portable export removes original photo filenames', () => {
  const value = JSON.parse(exportLook('Example', { photoName: 'private-original-filename.jpg' }));
  assert.equal(value.settings.photoName, '');
});

test('Malformed local JSON is preserved before saving replacement data', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { atomicJSON } = require('../src/core.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-corrupt-'));
  try {
    const file = path.join(directory, 'settings.json');
    fs.writeFileSync(file, '{broken');
    atomicJSON(file, { enabled: true });
    assert.equal(JSON.parse(fs.readFileSync(file)).enabled, true);
    const backups = fs
      .readdirSync(directory)
      .filter((name) => name.startsWith('settings.json.corrupt-'));
    assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(path.join(directory, backups[0]), 'utf8'), '{broken');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Portable photo export includes image bytes but no source filename', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-export-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `
      const fs = require('node:fs');
      const lib = require('./src/library.cjs');
      const settings = lib.importPhoto(fs.readFileSync('test/fixtures/background.png'), 'private-original-name.png');
      process.stdout.write(lib.exportLook('Shareable example', settings));
    `,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, COMPANION_STATE_DIR: directory },
        encoding: 'utf8',
        maxBuffer: 30 * 1024 * 1024,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const exported = JSON.parse(result.stdout);
    assert.ok(exported.photo.startsWith('data:image/jpeg;base64,'));
    assert.equal(exported.settings.photoName, 'Background photo');
    assert.ok(!result.stdout.includes('private-original-name'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
