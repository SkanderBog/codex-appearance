'use strict';
const $ = (id) => document.getElementById(id),
  api = window.companion;
let data,
  pending = {},
  timer,
  queue = Promise.resolve(),
  revision = 0,
  changing = 0,
  editingLookId = null,
  sampleReveal = false;
let renderedPhoto, renderedLooks;
function status(text) {
  $('status').textContent = text;
}
function page(name) {
  for (const el of document.querySelectorAll('.page')) el.hidden = el.id !== 'page-' + name;
  for (const el of document.querySelectorAll('.nav-item')) {
    el.classList.toggle('selected', el.dataset.page === name);
    if (el.dataset.page === name) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
  document.querySelector('.editor').scrollTop = 0;
}
const ranges = {
  opacity: [100, '%'],
  fontSize: [1, ' px'],
  codeSize: [1, ' px'],
  lineHeight: [100, '×'],
  photoX: [1, '%'],
  photoY: [1, '%'],
  photoTint: [100, '%'],
  photoBlur: [1, ' px'],
  homePhotoStrength: [100, '%'],
  taskPhotoStrength: [100, '%'],
  sidebarOpacity: [100, '%'],
  headerOpacity: [100, '%'],
  composerOpacity: [100, '%'],
  readingOpacity: [100, '%'],
  gradientAngle: [1, '°'],
};
function palette(s) {
  return s.customColors ? s : data.presets[s.preset];
}
function render(next, css = true) {
  data = next;
  const s = data.settings,
    p = palette(s);
  for (const el of document.querySelectorAll('.theme-card'))
    el.setAttribute('aria-pressed', String(!s.customColors && el.dataset.preset === s.preset));
  for (const [key, [scale, suffix]] of Object.entries(ranges)) {
    $(key).value = Math.round(s[key] * scale);
    $(key + '-value').value =
      key === 'lineHeight' ? s[key].toFixed(2) + suffix : Math.round(s[key] * scale) + suffix;
  }
  for (const key of ['enabled', 'customColors', 'terminalMode', 'reducedMotion'])
    $(key).checked = s[key];
  for (const key of ['font', 'photoFit', 'contentWidth']) $(key).value = s[key];
  for (const key of ['background', 'foreground', 'accent']) {
    $(key).value = p[key];
  }
  $('gradientColor').value = s.gradientColor;
  for (const el of document.querySelectorAll('[data-mode]'))
    el.setAttribute('aria-pressed', String(el.dataset.mode === s.backgroundMode));
  for (const mode of ['solid', 'gradient', 'photo'])
    $(mode + '-options').hidden = mode !== s.backgroundMode;
  $('photo-name').textContent = s.photoName || 'No photo selected';
  $('remove-photo').hidden = !s.photo;
  $('match-photo').disabled = !data.photoData;
  if (data.photoData) {
    if (renderedPhoto !== data.photoData) $('photo-thumb').src = data.photoData;
    $('photo-thumb').hidden = false;
    $('drop-label').querySelector('strong').textContent = 'Change photo';
  } else {
    $('photo-thumb').hidden = true;
    $('photo-thumb').removeAttribute('src');
    $('drop-label').querySelector('strong').textContent = '＋ Choose a photo';
  }
  renderedPhoto = data.photoData;
  $('sample-alpha').textContent = Math.round((s.enabled ? s.opacity : 1) * 100) + '%';
  $('sample-sidebar').hidden = s.enabled && s.terminalMode && !sampleReveal;
  $('sampleWindow').style.maxWidth =
    s.enabled && s.contentWidth === 'comfortable' ? '320px' : '100%';
  $('no-look').setAttribute('aria-pressed', String(!s.enabled));
  $('look-label').textContent = !s.enabled
    ? 'No look · Codex style'
    : (s.customColors ? 'Custom' : p.name) +
      ' / ' +
      s.backgroundMode[0].toUpperCase() +
      s.backgroundMode.slice(1);
  if (css && $('sample-style').textContent !== data.previewCSS)
    $('sample-style').textContent = data.previewCSS;
  $('undo').disabled = !data.canUndo;
  $('redo').disabled = !data.canRedo;
  $('safety-note').hidden = !data.layoutRestored;
  const luminance = (hex) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const a = luminance(p.foreground),
    b = luminance(p.background),
    contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  $('contrast-note').textContent =
    `Solid-color contrast ${contrast.toFixed(1)}:1${contrast < 4.5 ? ' · Try lighter text or a darker background.' : ' · Photos and transparency affect readability.'}`;
  if (css) renderLooks();
}
function change(patch) {
  revision++;
  pending = { ...pending, ...patch };
  render({ ...data, settings: { ...data.settings, ...patch } }, false);
  clearTimeout(timer);
  timer = setTimeout(flush, 110);
}
function flush() {
  clearTimeout(timer);
  if (!Object.keys(pending).length) return queue;
  const patch = pending,
    rev = revision;
  pending = {};
  changing++;
  queue = queue
    .then(() => api.save(patch))
    .then((result) => {
      if (rev === revision) render(result);
      status('Saved. Open styled Codex and preview windows update automatically.');
    })
    .catch((error) => status(error.message))
    .finally(() => changing--);
  return queue;
}
async function action(fn, message) {
  try {
    await flush();
    changing++;
    const result = await fn();
    if (result?.settings) {
      revision++;
      render(result);
    }
    if (message && result !== null && result !== false) status(message);
    return result;
  } catch (error) {
    status(error.message);
    return null;
  } finally {
    changing--;
  }
}
function openSave(look = null) {
  editingLookId = look?.id || null;
  $('look-name').value = look?.name || '';
  $('save-title').textContent = look ? 'Update this look.' : 'Name this look.';
  $('save-description').textContent = look
    ? 'Replace this saved look with your current colors, background, typography, and layout.'
    : 'Colors, background, typography, and layout, together.';
  $('save-submit').textContent = look ? 'Update look' : 'Save look';
  $('save-dialog').showModal();
  $('look-name').focus();
}
function renderLooks() {
  const list = $('looks');
  const query = $('look-search').value.trim().toLocaleLowerCase();
  const key = JSON.stringify([query, data.looks]);
  if (renderedLooks === key) return;
  renderedLooks = key;
  list.replaceChildren();
  const looks = data.looks.filter((look) =>
    [
      look.name,
      look.settings.customColors ? 'Custom colors' : palette(look.settings).name,
      look.settings.backgroundMode,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query),
  );
  if (!looks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = data.looks.length
      ? 'No matching looks. Try another name or palette.'
      : 'Your favorite spaces, all in one place. Save your first look to start a collection.';
    list.append(empty);
    return;
  }
  for (const look of looks) {
    const p = palette(look.settings),
      card = document.createElement('div');
    card.className = 'look-card';
    const load = document.createElement('button');
    load.className = 'look-load';
    load.title = 'Apply ' + look.name;
    load.dataset.look = look.id;
    const swatch = document.createElement('span');
    swatch.className = 'look-swatch';
    swatch.textContent = 'Aa';
    swatch.style.background = p.background;
    swatch.style.color = p.accent;
    const name = document.createElement('span');
    name.className = 'look-name';
    name.textContent = look.name;
    const sub = document.createElement('small');
    sub.textContent =
      (look.settings.customColors ? 'Custom colors' : p.name) +
      ' · ' +
      look.settings.backgroundMode;
    name.append(sub);
    load.append(swatch, name);
    load.onclick = () => action(() => api.loadLook(look.id), 'Applied ' + look.name + '.');
    const update = document.createElement('button');
    update.className = 'text-button look-update';
    update.textContent = 'Update';
    update.title = 'Replace ' + look.name + ' with the current appearance';
    update.setAttribute('aria-label', 'Update ' + look.name);
    update.dataset.updateLook = look.id;
    update.onclick = () => openSave(look);
    const remove = document.createElement('button');
    remove.className = 'look-delete';
    remove.textContent = '×';
    remove.title = 'Delete ' + look.name;
    remove.setAttribute('aria-label', 'Delete ' + look.name);
    remove.onclick = () =>
      action(() => api.deleteLook(look.id), 'Removed ' + look.name + ' from saved looks.');
    card.append(load, update, remove);
    list.append(card);
  }
}
for (const button of document.querySelectorAll('[data-page]'))
  button.onclick = () => page(button.dataset.page);
for (const button of document.querySelectorAll('button[data-preview-route]'))
  button.onclick = () => {
    $('sampleWindow').dataset.previewRoute = button.dataset.previewRoute;
    for (const item of document.querySelectorAll('button[data-preview-route]'))
      item.setAttribute('aria-pressed', String(item === button));
  };
for (const [key, [scale]] of Object.entries(ranges))
  $(key).oninput = (e) => change({ [key]: Number(e.target.value) / scale, enabled: true });
for (const key of ['terminalMode', 'reducedMotion', 'enabled'])
  $(key).onchange = (e) =>
    change({ [key]: e.target.checked, ...(key === 'enabled' ? {} : { enabled: true }) });
for (const key of ['font', 'photoFit', 'contentWidth'])
  $(key).onchange = (e) => change({ [key]: e.target.value, enabled: true });
$('customColors').onchange = (e) =>
  change({
    customColors: e.target.checked,
    background: $('background').value,
    foreground: $('foreground').value,
    accent: $('accent').value,
    enabled: true,
  });
for (const key of ['background', 'foreground', 'accent'])
  $(key).oninput = () =>
    change({
      customColors: true,
      background: $('background').value,
      foreground: $('foreground').value,
      accent: $('accent').value,
      enabled: true,
    });
$('gradientColor').oninput = (e) => change({ gradientColor: e.target.value, enabled: true });
for (const button of document.querySelectorAll('[data-mode]'))
  button.onclick = () => change({ backgroundMode: button.dataset.mode, enabled: true });
$('sample-panels').onclick = () => {
  sampleReveal = !sampleReveal;
  render(data, false);
};
$('photo-drop').onclick = () => {
  status('Choose a photo in the file picker.');
  action(() => api.pickPhoto(), 'Photo added locally. Adjust its crop and overlay below.');
};
$('remove-photo').onclick = () => change({ photo: '', photoName: '', backgroundMode: 'solid' });
$('match-photo').onclick = () =>
  action(
    () => api.matchPhoto(),
    'Photo colors applied. Use Undo to restore your previous palette.',
  );
const drop = $('photo-drop');
for (const event of ['dragenter', 'dragover'])
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.add('drag-over');
  });
drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  drop.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    status('Choose an image under 20 MB.');
    return;
  }
  status('Preparing your photo…');
  await action(async () => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return api.dropPhoto({ name: file.name, bytes: btoa(binary) });
  }, 'Photo added locally.');
});
// Prevent dropped files outside the picker from navigating the app away from its controls.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
$('preview').onclick = () => action(() => api.preview());
$('locate-codex').onclick = () =>
  action(async () => {
    const result = await api.locateCodex();
    if (result) status(result.message);
  });
$('launch').onclick = () =>
  action(async () => {
    const result = await api.launch();
    status(result.message);
    return api.read();
  });
$('restore').onclick = () =>
  action(() => api.restore(), 'Appearance layer off. Your custom settings are kept.');
$('no-look').onclick = () =>
  action(() => api.restore(), 'No look applied. Choose a look or use Undo to bring it back.');
$('reset').onclick = () =>
  action(() => api.reset(), 'Default settings restored. Use Undo to recover the previous look.');
$('undo').onclick = () => action(() => api.undo(), 'Previous appearance restored.');
$('redo').onclick = () => action(() => api.redo(), 'Appearance change reapplied.');
$('copy').onclick = () =>
  action(
    () => api.copyTheme(),
    'Palette copied. In Codex: Settings → Appearance → Dark theme → Import.',
  );
$('save-look').onclick = () => openSave();
$('quick-save').onclick = () => openSave();
$('look-search').oninput = () => renderLooks();
$('cancel-save').onclick = () => $('save-dialog').close();
$('save-form').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('look-name').value.trim();
  if (!name) return;
  const id = editingLookId;
  $('save-submit').disabled = true;
  const result = await action(
    () => (id ? api.updateLook({ id, name }) : api.saveLook(name)),
    (id ? 'Updated ' : 'Saved ') + name + '.',
  );
  $('save-submit').disabled = false;
  if (result) {
    $('save-dialog').close();
    $('look-search').value = '';
    renderLooks();
    page('looks');
  }
};
$('import-look').onclick = () =>
  action(() => api.importLook(), 'Look imported into your collection.');
$('export-look').onclick = () =>
  action(() => api.exportLook('My Codex look'), 'Look exported, including its background photo.');
$('minimize').onclick = () => api.window('minimize');
$('maximize').onclick = () => api.window('maximize');
$('close').onclick = async () => {
  await flush();
  api.close();
};
document.addEventListener('keydown', (e) => {
  // Preserve native text-field undo while editing a name or search query.
  const textField =
    e.target instanceof Element &&
    e.target.matches(
      'input:not([type="range"]):not([type="checkbox"]):not([type="color"]), textarea, [contenteditable="true"]',
    );
  if (
    (e.ctrlKey || e.metaKey) &&
    !e.altKey &&
    !$('save-dialog').open &&
    !textField &&
    ['z', 'y'].includes(e.key.toLowerCase())
  ) {
    e.preventDefault();
    if (e.key.toLowerCase() === 'y' || e.shiftKey) $('redo').click();
    else $('undo').click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (!$('save-dialog').open) openSave();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    page('background');
    action(() => api.pickPhoto(), 'Photo added locally.');
  }
});
api
  .read()
  .then((result) => {
    data = result;
    $('version').textContent = data.native
      ? 'NATIVE PROTOTYPE'
      : data.standalone
        ? 'STANDALONE EDITOR'
        : 'CODEX ' + data.version;
    if (data.canLocateCodex) {
      $('locate-codex').hidden = false;
      $('runtime-note').textContent =
        'Opens the reviewed Codex build with your saved appearance. Installed Codex files stay unchanged. No look restores its original appearance.';
    }
    if (!data.canLaunchCodex) {
      $('launch').disabled = true;
      $('launch').textContent = 'Codex styling unavailable';
      $('launch').title = 'Native Codex styling has not been validated in this edition.';
      $('runtime-note').textContent =
        'Edit and preview without a Codex account or installation. Applying backgrounds and layout to Codex is not available in this edition. Export your looks for a supported installation.';
    }
    $('app-version').textContent = 'Appearance ' + data.appVersion;
    for (const look of data.builtIns) {
      const button = document.createElement('button');
      button.className = 'built-in-look';
      button.dataset.builtIn = look.id;
      const image = document.createElement('img');
      image.src = '../assets/themes/' + look.id + '.jpg';
      image.alt = '';
      const label = document.createElement('strong');
      label.textContent = look.name;
      const description = document.createElement('small');
      description.textContent = look.description;
      button.append(image, label, description);
      button.onclick = () =>
        action(
          () => api.loadBuiltIn(look.id),
          'Applied ' + look.name + '. Use Undo to restore your previous look.',
        );
      $('built-in-looks').append(button);
    }
    for (const [id, p] of Object.entries(data.presets)) {
      const button = document.createElement('button');
      button.className = 'theme-card';
      button.dataset.preset = id;
      button.title = p.description;
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.textContent = 'Aa';
      swatch.style.background = p.background;
      swatch.style.color = p.foreground;
      const dot = document.createElement('i');
      dot.style.background = p.accent;
      swatch.append(dot);
      const name = document.createElement('span');
      name.className = 'theme-name';
      name.textContent = p.name;
      const check = document.createElement('span');
      check.className = 'theme-check';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');
      button.append(swatch, name, check);
      button.onclick = () => change({ preset: id, customColors: false, enabled: true });
      $('themes').append(button);
    }
    for (const [id, name] of Object.entries(data.fonts)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      $('font').append(option);
    }
    render(result);
  })
  .catch((e) => status(e.message));
window.addEventListener('focus', () => {
  if (data && !changing && !Object.keys(pending).length)
    api
      .read()
      .then(render)
      .catch((e) => status(e.message));
});

api.onSettings((update) => {
  if (update.error) status(update.error);
});
