'use strict';
const { OUTPUT } = require('./paths.cjs');
const fs = require('node:fs');
fs.mkdirSync(OUTPUT, { recursive: true, mode: 0o700 });
const path = require('node:path');
const {
  ROOT,
  STATE,
  ASSETS,
  DEFAULTS,
  readSettings,
  saveSettings,
  assetDataURL,
} = require('./core.cjs');
const library = require('./library.cjs');
const { evaluate } = require('./evaluate.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runSelfTest({ control, openPreview, getPreview, notify, nativeImage, dialog }) {
  const original = readSettings(),
    looksPath = path.join(STATE, 'looks.json');
  const oldLooks = fs.existsSync(looksPath) ? fs.readFileSync(looksPath) : null;
  const oldAssets = new Set(fs.existsSync(ASSETS) ? fs.readdirSync(ASSETS) : []);
  const report = {
    passed: false,
    time: new Date().toISOString(),
    electron: process.versions.electron,
    assertions: [],
  };
  const check = (name, passed, detail) => {
    report.assertions.push({ name, passed: !!passed, detail });
    console.log('[self-test]', name, !!passed);
    if (!passed) throw new Error(name);
  };
  const run = (code) => evaluate(control.webContents, code);
  const click = async (selector) => {
    await run(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await sleep(300);
  };
  const input = async (id, value, event = 'input') => {
    await run(
      `(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`,
    );
    await sleep(350);
  };
  try {
    saveSettings(DEFAULTS);
    await run('window.companion.read().then(render)');
    await sleep(300);
    check(
      '16 selectable palettes',
      await run("document.querySelectorAll('.theme-card').length===16"),
    );
    check(
      'Five navigable categories',
      await run("document.querySelectorAll('[data-page]').length===5"),
    );
    await click('[data-preset="amber"]');
    check('Palette persists through UI', readSettings().preset === 'amber');
    await input('opacity', 60);
    check('Opacity persists', readSettings().opacity === 0.6);
    await click('[data-page="typography"]');
    await input('font', 'liberation', 'change');
    await input('fontSize', 17);
    await input('codeSize', 15);
    await input('lineHeight', 175);
    check(
      'Font, code size, and spacing persist',
      readSettings().font === 'liberation' &&
        readSettings().fontSize === 17 &&
        readSettings().codeSize === 15 &&
        readSettings().lineHeight === 1.75,
    );
    await openPreview();
    await sleep(600);
    const preview = getPreview();
    let rendering = await evaluate(
      preview.webContents,
      `(()=>{const b=getComputedStyle(document.querySelector('.terminal')),t=getComputedStyle(document.querySelector('.sample-answer'));return{background:b.backgroundColor,font:t.fontFamily,size:t.fontSize,spacing:t.lineHeight,textOpacity:t.opacity,bodyOpacity:getComputedStyle(document.body).opacity}})()`,
    );
    check(
      'Native preview has background alpha and opaque text',
      rendering.background === 'rgba(27, 21, 16, 0.6)' &&
        rendering.textOpacity === '1' &&
        rendering.bodyOpacity === '1',
      rendering,
    );
    check(
      'Native preview uses selected font and size',
      rendering.font.includes('Liberation Mono') && rendering.size === '17px',
      rendering,
    );
    await click('[data-page="background"]');
    await click('[data-mode="gradient"]');
    await input('gradientColor', '#446688');
    await input('gradientAngle', 70);
    let surface = await evaluate(
      preview.webContents,
      `(()=>{const p=getComputedStyle(document.querySelector('.terminal'),'::before');return{image:p.backgroundImage,opacity:p.opacity}})()`,
    );
    check(
      'Native gradient layer renders',
      surface.image.includes('70deg') &&
        surface.image.includes('68, 102, 136') &&
        surface.opacity === '0.6',
      surface,
    );
    await click('[data-mode="photo"]');
    const fixture = fs.readFileSync(path.join(ROOT, 'test/fixtures/background.png'));
    await run(
      `(()=>{const b=atob(${JSON.stringify(fixture.toString('base64'))});const bytes=Uint8Array.from(b,c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'test-background.png',{type:'image/png'}));document.getElementById('photo-drop').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));})()`,
    );
    await sleep(800);
    let s = readSettings();
    check(
      'Dropping a real File imports a photo',
      s.backgroundMode === 'photo' &&
        s.photoName === 'test-background.png' &&
        !!assetDataURL(s.photo),
    );
    const decoded = nativeImage.createFromPath(path.join(ASSETS, s.photo));
    check(
      'Large photos resized to 2560 pixels',
      decoded.getSize().width === 2560,
      decoded.getSize(),
    );
    await input('photoTint', 42);
    await input('photoBlur', 4);
    await input('photoX', 28);
    await input('photoFit', 'contain', 'change');
    surface = await evaluate(
      preview.webContents,
      `(()=>{const p=getComputedStyle(document.querySelector('.terminal'),'::before');return{hasPhoto:p.backgroundImage.includes('data:image/jpeg;base64,'),filter:p.filter,fit:p.backgroundSize,position:p.backgroundPosition,opacity:p.opacity}})()`,
    );
    check(
      'Photo, crop, blur and alpha reach native preview',
      surface.hasPhoto &&
        surface.filter === 'blur(4px)' &&
        surface.fit.split(', ').every((x) => x === 'contain') &&
        surface.position.includes('28%') &&
        surface.opacity === '0.6',
      surface,
    );
    const photoShot = await preview.webContents.capturePage();
    fs.writeFileSync(path.join(OUTPUT, 'photo-preview.png'), photoShot.toPNG());
    const bytes = photoShot.toBitmap();
    let translucent = 0,
      opaque = 0,
      solidText = 0;
    for (let i = 3; i < bytes.length; i += 4) {
      if (bytes[i] > 0 && bytes[i] < 240) translucent++;
      if (bytes[i] === 255) opaque++;
      if (bytes[i] === 255 && bytes[i - 1] === 249 && bytes[i - 2] === 232 && bytes[i - 3] === 206)
        solidText++;
    }
    check(
      'Photo background pixels translucent; text pixels solid',
      translucent > 10000 && solidText > 50,
      { translucent, opaque, solidText },
    );
    // Portable export/import exercises the same codecs used by the native file dialogs.
    const webp = library.importPhoto(
      fs.readFileSync(path.join(ROOT, 'test/fixtures/background.webp')),
      'test.webp',
      nativeImage,
    );
    check('WebP photos decode successfully', !!assetDataURL(webp.photo));
    const exported = library.exportLook('Portable test', readSettings());
    const imported = library.importLook(exported, nativeImage);
    check(
      'Export embeds the photo and import recovers layout',
      imported.name === 'Portable test' &&
        !!assetDataURL(imported.settings.photo) &&
        imported.settings.photoX === 28 &&
        imported.settings.font === 'liberation',
    );
    let rejected = false;
    try {
      library.importPhoto(Buffer.from('<svg/>'), 'bad.svg', nativeImage);
    } catch {
      rejected = true;
    }
    check('Unsupported image content rejected', rejected);
    rejected = false;
    try {
      library.importLook('{"format":"wrong"}', nativeImage);
    } catch {
      rejected = true;
    }
    check('Invalid imported look rejected', rejected);
    check(
      'Native file-picker and save-dialog APIs available',
      typeof dialog.showOpenDialog === 'function' && typeof dialog.showSaveDialog === 'function',
    );
    await click('#quick-save');
    check('Save dialog opens', await run("document.getElementById('save-dialog').open"));
    await input('look-name', 'Test <look>');
    await run("document.getElementById('save-form').requestSubmit()");
    await sleep(400);
    let saved = library.readLooks().find((x) => x.name === 'Test <look>');
    check('Named look saved with photo and settings', !!saved && saved.settings.photoX === 28);
    await click('[data-page="palettes"]');
    await click('[data-preset="ocean"]');
    await click('[data-page="looks"]');
    await click(`[data-look="${saved.id}"]`);
    check(
      'Saved look restores full configuration',
      readSettings().preset === 'amber' &&
        readSettings().font === 'liberation' &&
        readSettings().photoX === 28,
    );
    check(
      'Look names displayed as plain text',
      await run(
        "document.querySelector('.look-name').textContent.includes('Test <look>')&&!document.querySelector('.look-name look')",
      ),
    );
    await click('[data-page="layout"]');
    await input('contentWidth', 'comfortable', 'change');
    await click('#reducedMotion');
    check(
      'Layout options saved',
      readSettings().contentWidth === 'comfortable' && readSettings().reducedMotion,
    );
    await click('#restore');
    check(
      'Restore switches off styles and preserves preferences',
      !readSettings().enabled &&
        readSettings().photoX === 28 &&
        readSettings().font === 'liberation',
    );
    await click('#undo');
    check(
      'Undo recovers active previous look',
      readSettings().enabled && readSettings().photoX === 28,
    );
    await click('[data-page="palettes"]');
    await input('foreground', '#eeddcc');
    check(
      'Custom color picker enables custom palette',
      readSettings().customColors && readSettings().foreground === '#EEDDCC',
    );
    await click('[data-page="layout"]');
    await click('#reset');
    check(
      'Reset returns to defaults',
      readSettings().font === 'mono' && readSettings().backgroundMode === 'solid',
    );
    await click('#undo');
    check(
      'Undo can recover reset configuration',
      readSettings().customColors && readSettings().foreground === '#EEDDCC',
    );
    const layout = await run(
      `({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.preview-actions button')].map(e=>({w:e.clientWidth,content:e.scrollWidth}))})`,
    );
    check(
      'Controls fit the desktop window',
      !layout.overflow && layout.buttons.every((b) => b.content <= b.w),
      layout,
    );
    saveSettings(DEFAULTS);
    notify(DEFAULTS);
    await run('window.companion.read().then(render)');
    await click('[data-page="palettes"]');
    fs.writeFileSync(
      path.join(OUTPUT, 'companion.png'),
      (await control.webContents.capturePage()).toPNG(),
    );
    // Keep a diagnostic photo-page screenshot without retaining test settings or saved looks.
    saveSettings({ ...imported.settings, enabled: true });
    notify(readSettings());
    await run('window.companion.read().then(render)');
    await click('[data-page="background"]');
    fs.writeFileSync(
      path.join(OUTPUT, 'background-controls.png'),
      (await control.webContents.capturePage()).toPNG(),
    );
    report.passed = true;
  } catch (error) {
    report.error = error.stack;
    try {
      fs.writeFileSync(
        path.join(OUTPUT, 'self-test-failure.png'),
        (await control.webContents.capturePage()).toPNG(),
      );
    } catch {}
    throw error;
  } finally {
    saveSettings(original);
    if (oldLooks) fs.writeFileSync(looksPath, oldLooks);
    else if (fs.existsSync(looksPath)) fs.unlinkSync(looksPath);
    if (fs.existsSync(ASSETS))
      for (const name of fs.readdirSync(ASSETS))
        if (!oldAssets.has(name)) fs.unlinkSync(path.join(ASSETS, name));
    fs.writeFileSync(path.join(OUTPUT, 'self-test-report.json'), JSON.stringify(report, null, 2));
  }
}
module.exports = { runSelfTest };
