'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runPhotoHelper } = require('./photo-helper.cjs');
const { ROOT, STATE, ASSETS, normalize, atomicJSON, assetDataURL } = require('./core.cjs');
const bundledLooks = require('../assets/themes/catalog.json');
const MAX_IMAGE = 20 * 1024 * 1024;
const LOOKS = path.join(STATE, 'looks.json');
function builtInLooks() {
  return bundledLooks.map(({ id, name, description }) => ({ id, name, description }));
}
function loadBuiltIn(id) {
  const look = bundledLooks.find((entry) => entry.id === id);
  if (!look) throw new Error('Choose an included look.');
  const bytes = fs.readFileSync(path.join(ROOT, 'assets/themes', look.id + '.jpg'));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== look.sha256)
    throw new Error('This included background is damaged. Download a fresh copy of the companion.');
  const photo = importPhoto(bytes, look.name);
  const attribution =
    `Artwork and theme colors: ${look.name}, Codex Habitat contributors.\nSource: https://github.com/wp-a/CodexHabitat/tree/71a38c09610432d91c582006867b82ffd8fd8529\nAdapted for Codex Appearance.\n\n` +
    fs.readFileSync(path.join(ROOT, 'assets/themes/LICENSE'), 'utf8');
  atomicJSON(path.join(ASSETS, photo.photo + '.attribution.json'), attribution);
  return { ...look.settings, ...photo, enabled: true };
}
function photoAttribution(id) {
  if (!assetDataURL(id)) return '';
  try {
    const file = path.join(ASSETS, id + '.attribution.json');
    if (!fs.lstatSync(file).isFile() || fs.statSync(file).size > 24000) return '';
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof value === 'string' && value.length <= 10000 ? value : '';
  } catch {
    return '';
  }
}
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
function updateLook(id, name, settings) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Give this look a name first.');
  const looks = readLooks();
  const index = looks.findIndex((look) => look.id === id);
  if (index < 0) throw new Error('This look could not be found.');
  looks[index] = { ...looks[index], name: name.trim().slice(0, 60), settings: normalize(settings) };
  atomicJSON(LOOKS, looks);
  return looks[index];
}
function photoPalette(id) {
  const photo = assetDataURL(id);
  if (!photo) throw new Error('Choose a photo before matching its colors.');
  const result = runPhotoHelper(
    ['--palette'],
    Buffer.from(photo.slice('data:image/jpeg;base64,'.length), 'base64'),
    MAX_IMAGE,
  );
  if (result.error || result.status !== 0)
    throw new Error('The photo colors could not be read. Try choosing the photo again.');
  const colors = JSON.parse(result.stdout.toString());
  if (!['background', 'foreground', 'accent'].every((key) => /^#[0-9A-F]{6}$/.test(colors[key])))
    throw new Error('The photo did not produce a valid palette.');
  return { background: colors.background, foreground: colors.foreground, accent: colors.accent };
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
  const result = runPhotoHelper([], bytes, MAX_IMAGE);
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
    photo = assetDataURL(s.photo),
    attribution = photo ? photoAttribution(s.photo) : '';
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
        ...(attribution ? { photoAttribution: attribution } : {}),
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
  if (
    data.photoAttribution !== undefined &&
    (typeof data.photoAttribution !== 'string' || data.photoAttribution.length > 10000)
  )
    throw new Error('The photo attribution in this look is not supported.');
  if (data.photo) {
    if (typeof data.photo !== 'string' || !data.photo.startsWith('data:image/jpeg;base64,'))
      throw new Error('The photo in this look is not supported.');
    Object.assign(
      settings,
      importPhoto(decodeBase64(data.photo.slice(23)), data.settings.photoName || 'Imported photo'),
    );
    settings.backgroundMode = normalize(data.settings).backgroundMode;
    if (data.photoAttribution)
      atomicJSON(path.join(ASSETS, settings.photo + '.attribution.json'), data.photoAttribution);
  }
  return {
    name:
      typeof data.name === 'string' && data.name.trim() ? data.name.slice(0, 60) : 'Imported look',
    settings,
  };
}
module.exports = {
  builtInLooks,
  loadBuiltIn,
  MAX_IMAGE,
  readLooks,
  saveLook,
  deleteLook,
  updateLook,
  photoPalette,
  decodeBase64,
  imageFormat,
  importPhoto,
  exportLook,
  importLook,
};
