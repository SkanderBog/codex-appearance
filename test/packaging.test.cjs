'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { stageSource, copyPortableHelper } = require('../scripts/package-desktop.cjs');
const { photoCommand } = require('../src/photo-helper.cjs');
const { photoPixels } = require('../src/signed-out-check.cjs');

test(
  'Bundled helper links survive relocation and reject external targets',
  { skip: process.platform === 'win32' },
  () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'portable helper '));
    try {
      const source = path.join(folder, 'build');
      const destination = path.join(folder, 'package');
      fs.mkdirSync(path.join(source, 'framework/Versions/A'), { recursive: true });
      fs.writeFileSync(path.join(source, 'framework/Versions/A/Python'), 'bundled runtime');
      fs.symlinkSync('Versions/A/Python', path.join(source, 'framework/Python'));
      fs.symlinkSync(path.join(source, 'framework/Python'), path.join(source, 'Python'));
      copyPortableHelper(source, destination);
      fs.renameSync(source, source + '-unavailable');
      assert.equal(path.isAbsolute(fs.readlinkSync(path.join(destination, 'Python'))), false);
      assert.equal(fs.readFileSync(path.join(destination, 'Python'), 'utf8'), 'bundled runtime');
      fs.renameSync(source + '-unavailable', source);
      fs.writeFileSync(path.join(folder, 'external'), 'not bundled');
      fs.symlinkSync(path.join(folder, 'external'), path.join(source, 'outside'));
      assert.throws(() => copyPortableHelper(source, path.join(folder, 'rejected')), /escapes/);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  },
);

test('Native screenshot evidence distinguishes alpha, fixture colors and opaque foreground', () => {
  const pixels = Buffer.from([
    100,
    70,
    25,
    153, // Translucent blue fixture pixel.
    30,
    80,
    25,
    153, // Translucent green fixture pixel.
    206,
    232,
    249,
    255, // Opaque amber foreground.
    206,
    232,
    249,
    153, // Faded text must not count as opaque foreground.
    100,
    70,
    25,
    255, // A flattened photo must not count as translucent.
    0,
    0,
    0,
    0, // Empty pixels must not count as rendered photo.
  ]);
  assert.deepEqual(photoPixels(pixels), { translucent: 3, photo: 2, opaque: 2, foreground: 1 });
});

test('Packaged photo decoding resolves only the bundled native executable', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance helper '));
  try {
    assert.throws(() => photoCommand({ packaged: true, resources: folder }), /missing/);
    fs.mkdirSync(path.join(folder, 'photo-helper'));
    for (const [platform, name] of [
      ['win32', 'photo-helper.exe'],
      ['darwin', 'photo-helper'],
    ]) {
      const executable = path.join(folder, 'photo-helper', name);
      fs.writeFileSync(executable, 'fixture');
      assert.deepEqual(
        photoCommand({ packaged: true, resources: folder, platform, python: 'never-use-this' }),
        [executable, []],
      );
    }
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('Native staging copies only an explicit manifest and omits private workspace data', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance staging '));
  try {
    const source = path.join(folder, 'source');
    const destination = path.join(folder, 'destination');
    fs.mkdirSync(path.join(source, 'desktop'), { recursive: true });
    fs.writeFileSync(
      path.join(source, 'package.json'),
      '{"version":"1.2.3-alpha.1","private":"secret"}',
    );
    fs.writeFileSync(path.join(source, 'desktop/bundle-files.txt'), 'public.cjs\n');
    fs.writeFileSync(path.join(source, 'public.cjs'), 'public');
    fs.writeFileSync(path.join(source, 'private-auth.json'), 'private fixture');
    const { manifest } = stageSource(source, destination);
    assert.deepEqual(fs.readdirSync(destination).sort(), [
      'bundle-manifest.json',
      'package.json',
      'public.cjs',
    ]);
    assert.equal(manifest[0].path, 'public.cjs');
    assert.equal(manifest[0].sha256.length, 64);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(destination, 'package.json'))).private,
      undefined,
    );
    fs.writeFileSync(path.join(source, 'desktop/bundle-files.txt'), '../private-auth.json\n');
    assert.throws(() => stageSource(source, destination), /Unsafe/);
    fs.writeFileSync(path.join(source, 'desktop/bundle-files.txt'), 'public.cjs\npublic.cjs\n');
    assert.throws(() => stageSource(source, destination), /Duplicate/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
