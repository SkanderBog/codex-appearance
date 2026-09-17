'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ROOT, STATE, ASSETS, normalize, atomicJSON, assetDataURL } = require('./core.cjs');
const MAX_IMAGE = 20 * 1024 * 1024;
const LOOKS = path.join(STATE, 'looks.json');
function readLooks() {
  try {
    const data = JSON.parse(fs.readFileSync(LOOKS, 'utf8'));
    return Array.isArray(data)
      ? data
          .filter((x) => x && /^[a-f0-9-]{36}$/.test(x.id) && typeof x.name === 'string')
          .slice(0, 100)
          .map((x) => ({ ...x, settings: normalize(x.settings) }))
      : [];
  } catch {
    return [];
  }
}
function saveLook(name, settings) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Give this look a name first.');
  const looks = readLooks();
  if (looks.length >= 100)
    throw new Error('Your library is full. Remove a look before adding another.');
  const look = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 60),
    created: new Date().toISOString(),
    settings: normalize(settings),
  };
  looks.unshift(look);
  atomicJSON(LOOKS, looks);
  return look;
}
function deleteLook(id) {
  atomicJSON(
    LOOKS,
    readLooks().filter((x) => x.id !== id),
  );
}
function decodeBase64(text) {
  if (
    typeof text !== 'string' ||
    text.length > Math.ceil(MAX_IMAGE / 3) * 4 ||
    !/^[a-zA-Z0-9+/]*={0,2}$/.test(text) ||
    text.length % 4
  )
    throw new Error('Choose a PNG, JPEG, or WebP image under 20 MB.');
  return Buffer.from(text, 'base64');
}
function imageFormat(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  return '';
}
function importPhoto(bytes, name) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_IMAGE || !imageFormat(bytes))
    throw new Error('Choose a PNG, JPEG, or WebP image under 20 MB.');
  const result = spawnSync(
    process.env.COMPANION_PYTHON || 'python3',
    [path.join(ROOT, 'scripts/prepare-photo.py')],
    { input: bytes, maxBuffer: MAX_IMAGE, timeout: 15000 },
  );
  if (result.error) throw new Error('The photo could not be prepared: ' + result.error.message);
  if (result.status !== 0)
    throw new Error(result.stderr.toString().trim() || 'This image could not be opened.');
  const encoded = result.stdout;
  if (!encoded.length || encoded.length > MAX_IMAGE)
    throw new Error('The image could not be prepared. Try a smaller photo.');
  const id = crypto.createHash('sha256').update(encoded).digest('hex') + '.jpg';
  fs.mkdirSync(ASSETS, { recursive: true, mode: 0o700 });
  const file = path.join(ASSETS, id);
  if (!fs.existsSync(file)) {
    const temp = file + '.tmp';
    fs.writeFileSync(temp, encoded, { mode: 0o600 });
    fs.renameSync(temp, file);
  }
  return {
    photo: id,
    photoName: typeof name === 'string' ? path.basename(name).slice(0, 120) : 'Photo',
    backgroundMode: 'photo',
  };
}
function exportLook(name, settings) {
  const s = normalize(settings),
    photo = assetDataURL(s.photo);
  // Filenames can contain names, places, or dates. Portable looks use a neutral label.
  s.photoName = photo ? 'Background photo' : '';
  return (
    JSON.stringify(
      {
        format: 'codex-appearance-look',
        version: 1,
        name: String(name || 'My look').slice(0, 60),
        settings: s,
        ...(photo ? { photo } : {}),
      },
      null,
      2,
    ) + '\n'
  );
}
function importLook(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 30 * 1024 * 1024)
    throw new Error('This look file is too large.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid look file.');
  }
  if (
    !data ||
    data.format !== 'codex-appearance-look' ||
    data.version !== 1 ||
    !data.settings ||
    typeof data.settings !== 'object' ||
    Array.isArray(data.settings)
  )
    throw new Error('Choose a look exported by Codex Appearance.');
  const settings = normalize({ ...data.settings, photo: '', photoName: '' });
  if (data.photo) {
    if (typeof data.photo !== 'string' || !data.photo.startsWith('data:image/jpeg;base64,'))
      throw new Error('The photo in this look is not supported.');
    Object.assign(
      settings,
      importPhoto(decodeBase64(data.photo.slice(23)), data.settings.photoName || 'Imported photo'),
    );
    settings.backgroundMode = normalize(data.settings).backgroundMode;
  }
  return {
    name:
      typeof data.name === 'string' && data.name.trim() ? data.name.slice(0, 60) : 'Imported look',
    settings,
  };
}
module.exports = {
  MAX_IMAGE,
  readLooks,
  saveLook,
  deleteLook,
  decodeBase64,
  imageFormat,
  importPhoto,
  exportLook,
  importLook,
};
