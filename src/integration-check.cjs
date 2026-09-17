'use strict';
const { OUTPUT } = require('./paths.cjs');
const fs = require('node:fs');
fs.mkdirSync(OUTPUT, { recursive: true, mode: 0o700 });
const path = require('node:path');
const { ROOT, ASSETS, readSettings, saveSettings } = require('./core.cjs');
const { nativeImage } = require('electron');
const { importPhoto } = require('./library.cjs');
const { evaluate } = require('./evaluate.cjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function integrationCheck(win, update) {
  const original = readSettings();
  const oldAssets = new Set(fs.existsSync(ASSETS) ? fs.readdirSync(ASSETS) : []);
  const report = {
    passed: false,
    time: new Date().toISOString(),
    app: 'Installed Codex in an isolated UI profile',
    sentPrompts: 0,
    assertions: [],
  };
  function check(name, passed, detail) {
    report.assertions.push({ name, passed: !!passed, detail });
    console.log('[companion-check]', name, !!passed);
    fs.writeFileSync(
      path.join(OUTPUT, 'codex-integration-report.json'),
      JSON.stringify(report, null, 2),
    );
    if (!passed) throw new Error(name);
  }
  const getState = () =>
    evaluate(
      win.webContents,
      `(() => {
    const panel=document.querySelector('.app-shell-left-panel');
    return { background:getComputedStyle(document.body).backgroundColor, opacity:getComputedStyle(document.body).opacity,
      sidebar:panel ? getComputedStyle(panel).display : null, sidebarWidth:panel?.getBoundingClientRect().width || 0,
      layer:!!document.getElementById('companion-appearance-style')?.textContent,
      controls:!!document.getElementById('companion-access'),
      composer:!!document.querySelector('[contenteditable="true"],textarea'),
      font:getComputedStyle(document.body).fontFamily,
      widths:[...document.querySelectorAll('[class*="--thread-content-max-width"], [style*="--thread-content-max-width"]')].map(e=>getComputedStyle(e).getPropertyValue('--thread-content-max-width').trim()),
      width:getComputedStyle(document.querySelector('[style*="--thread-content-max-width"]') || document.body).getPropertyValue('--thread-content-max-width').trim(),
      spacing:getComputedStyle(document.body).getPropertyValue('--line-height-composer').trim(),
      codeSize:getComputedStyle(document.body).getPropertyValue('--codex-chat-code-font-size').trim(),
      composerHeight:document.querySelector('[contenteditable="true"],textarea')?.getBoundingClientRect().height };
  })()`,
    );
  try {
    let ready;
    for (let attempt = 0; attempt < 40; attempt++) {
      ready = await getState();
      if (ready.composer && ready.sidebar !== null) break;
      await sleep(500);
    }
    check(
      'Codex conversation UI finished loading',
      ready.composer && ready.sidebar !== null,
      ready,
    );
    saveSettings({
      ...original,
      enabled: true,
      terminalMode: true,
      preset: 'amber',
      customColors: false,
      backgroundMode: 'solid',
      opacity: 0.6,
    });
    await sleep(900); // Verify the file watcher, not just a direct update call.
    let state = await getState();
    check(
      'Real Codex responds to companion settings',
      state.background === 'rgba(27, 21, 16, 0.6)',
      state,
    );
    check('Conversation input remains present', state.composer, state.composer);
    check(
      'Terminal mode hides the actual sidebar',
      state.sidebar === 'none' && state.sidebarWidth === 0,
      state,
    );
    check('The whole UI is not faded', state.opacity === '1', state.opacity);
    const control = await evaluate(
      win.webContents,
      `(() => {
      const button = document.querySelector('#companion-access button');
      const header = button?.closest('[class*="_ApplicationMenuTopBar_"]');
      if (!header) return { reachable: false };
      const r = button.getBoundingClientRect(), h = header.getBoundingClientRect();
      const safeRight = h.right - parseFloat(getComputedStyle(header).paddingRight);
      const reachable = [[0.2,0.2],[0.5,0.5],[0.8,0.8]].every(([x,y]) =>
        button.contains(document.elementFromPoint(r.left+r.width*x, r.top+r.height*y)));
      const siblings = [...header.children].filter(e => !e.contains(button));
      const overlaps = siblings.some(e => { const b=e.getBoundingClientRect();
        return b.width>0 && b.height>0 && r.left<b.right && r.right>b.left && r.top<b.bottom && r.bottom>b.top; });
      return { reachable, overlaps, safe: r.right <= safeRight && r.top >= h.top && r.bottom <= h.bottom,
        x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2) };
    })()`,
    );
    check(
      'Panels occupies a reachable menu-bar slot outside window controls',
      control.reachable && control.safe && !control.overlaps,
      control,
    );
    // A real pointer event catches overlays that programmatic click() misses.
    win.focus();
    win.webContents.focus();
    await sleep(150);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: control.x, y: control.y });
    win.webContents.sendInputEvent({
      type: 'mouseDown',
      x: control.x,
      y: control.y,
      button: 'left',
      clickCount: 1,
    });
    await sleep(50);
    win.webContents.sendInputEvent({
      type: 'mouseUp',
      x: control.x,
      y: control.y,
      button: 'left',
      clickCount: 1,
    });
    await sleep(300);
    state = await getState();
    check(
      'Panels button restores actual navigation',
      state.sidebar !== 'none' && state.sidebarWidth > 100,
      state,
    );
    // Verify the real keyboard handler as well as the injected button.
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'b', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'b', modifiers: ['control'] });
    await sleep(300);
    state = await getState();
    check('Ctrl+B hides the sidebar again', state.sidebar === 'none', state);
    const shot = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUTPUT, 'codex-test.png'), shot.toPNG());
    const bytes = shot.toBitmap();
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
      'Real Codex image retains background alpha and solid foreground pixels',
      translucent > 10000 && opaque > 300,
      { translucent, opaque },
    );
    check('Foreground text-color pixels remain fully opaque', solidText > 100, { solidText });
    const photo = importPhoto(
      fs.readFileSync(path.join(ROOT, 'test/fixtures/background.png')),
      'test-background.png',
      nativeImage,
    );
    saveSettings({
      ...readSettings(),
      ...photo,
      photoTint: 0.3,
      photoBlur: 3,
      photoFit: 'cover',
      photoX: 35,
      font: 'liberation',
      fontSize: 16,
      codeSize: 15,
      lineHeight: 1.75,
      contentWidth: 'full',
      reducedMotion: true,
    });
    await sleep(900);
    const photoState = await evaluate(
      win.webContents,
      `(() => {const p=getComputedStyle(document.body,'::before');return {hasPhoto:p.backgroundImage.includes('data:image/jpeg;base64,'),opacity:p.opacity,blur:p.filter,bodyOpacity:getComputedStyle(document.body).opacity,animation:getComputedStyle(document.body).animationDuration};})()`,
    );
    check(
      'Actual Codex accepts the photo layer with independent alpha and blur',
      photoState.hasPhoto &&
        photoState.opacity === '0.6' &&
        photoState.blur === 'blur(3px)' &&
        photoState.bodyOpacity === '1',
      photoState,
    );
    state = await getState();
    check(
      'Typography and width settings reach the real conversation',
      state.font.includes('Liberation Mono') &&
        state.width === '100%' &&
        state.widths.length > 0 &&
        state.widths.every((w) => w.startsWith('min(100%,')) &&
        state.spacing === '28px' &&
        state.codeSize === '15px' &&
        state.composerHeight > 15,
      state,
    );
    check(
      'Reduced motion applies to the real app',
      photoState.animation === '1e-05s' || photoState.animation === '0.00001s',
      photoState.animation,
    );
    const photoShot = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUTPUT, 'codex-photo-test.png'), photoShot.toPNG());
    const photoBytes = photoShot.toBitmap();
    let photoAlpha = 0,
      photoText = 0,
      colorful = 0,
      exactAlpha = 0;
    for (let i = 3; i < photoBytes.length; i += 4) {
      if (photoBytes[i] > 0 && photoBytes[i] < 240) photoAlpha++;
      if (photoBytes[i] === 153) exactAlpha++;
      if (
        photoBytes[i] === 255 &&
        photoBytes[i - 1] === 249 &&
        photoBytes[i - 2] === 232 &&
        photoBytes[i - 3] === 206
      )
        photoText++;
      if (photoBytes[i] > 120 && photoBytes[i] < 230 && photoBytes[i - 2] > photoBytes[i - 1] + 15)
        colorful++;
    }
    check(
      'Actual photo paints while text stays fully opaque',
      photoAlpha > 10000 && photoText > 100 && colorful > 10000 && exactAlpha > 10000,
      { photoAlpha, photoText, colorful, exactAlpha },
    );
    saveSettings({
      ...readSettings(),
      backgroundMode: 'gradient',
      gradientColor: '#446688',
      gradientAngle: 70,
    });
    await sleep(700);
    const gradient = await evaluate(
      win.webContents,
      `getComputedStyle(document.body,'::before').backgroundImage`,
    );
    check(
      'Gradient background also works inside Codex',
      gradient.includes('70deg') && gradient.includes('68, 102, 136'),
      gradient,
    );
    // Exercise the supported renderer's width classes in isolated layout fixtures.
    // No task contents or account identifiers are included in the report.
    for (const contentWidth of ['comfortable', 'wide', 'full']) {
      saveSettings({ ...readSettings(), contentWidth });
      await update();
      const layout = await evaluate(
        win.webContents,
        `(() => {
        const failures=[]; let cases=0;
        const fixture=document.createElement('div');
        fixture.style.cssText='position:fixed;left:0;top:0;opacity:0;pointer-events:none;height:100px';
        document.body.append(fixture);
        try {
          for (const width of [720,1096,1164,1440,1800]) {
            for (const pinned of [false,true]) {
              const reserved=pinned && width>=1096 ? 316 : 0;
              // Opening/closing animation frames as well as settled layouts.
              const shifts=width>=1096 && width<1536 ? [0,79,158] : [0];
              for (const shift of shifts) {
                fixture.replaceChildren(); fixture.style.width=width+'px';
                if (reserved) {
                  const floating=document.createElement('div');
                  floating.className='top-(--thread-floating-content-top-inset)';
                  const obstacle=document.createElement('div');
                  obstacle.dataset.pipObstacle='thread-summary-panel';
                  floating.append(obstacle);fixture.append(floating);
                }
                for (const gutter of [0,30]) {
                  const moving=document.createElement('div');
                  moving.style.cssText='width:'+(width-gutter)+'px;margin-inline:auto;transform:translateX(-'+shift+'px);--thread-wide-block-inline-shift:'+shift+'px';
                  const content=document.createElement('div');
                  content.className='max-w-(--thread-content-max-width)';
                  content.style.cssText='width:100%;margin-inline:auto;height:20px';
                  moving.append(content);fixture.append(moving);
                  const r=content.getBoundingClientRect();
                  const expected=Math.min(${JSON.stringify({ comfortable: 768, wide: 1216, full: null }[contentWidth])} ?? width,
                    width-gutter-2*Math.max(shift,reserved-shift));
                  cases++;
                  if(r.left < -0.5 || r.right > width-reserved+0.5 || Math.abs(r.width-expected)>0.5)
                    failures.push({width,pinned,shift,gutter,left:r.left,right:r.right,actual:r.width,expected});
                  moving.remove();
                }
              }
            }
          }
        } finally { fixture.remove(); }
        return { cases, failures };
      })()`,
      );
      check(
        'Conversation and composer fit beside the summary: ' + contentWidth,
        layout.cases > 0 && layout.failures.length === 0,
        layout,
      );
    }
    saveSettings({ ...original, enabled: false });
    await sleep(700);
    state = await getState();
    check(
      'Restore removes styles and companion controls',
      !state.layer && !state.controls && state.sidebar !== 'none',
      state,
    );
    report.passed = true;
  } catch (error) {
    report.error = error.stack;
    try {
      fs.writeFileSync(
        path.join(OUTPUT, 'codex-failure.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
    } catch {}
  } finally {
    saveSettings(original);
    await sleep(700);
    await update();
    if (fs.existsSync(ASSETS))
      for (const name of fs.readdirSync(ASSETS))
        if (!oldAssets.has(name)) fs.unlinkSync(path.join(ASSETS, name));
    fs.writeFileSync(
      path.join(OUTPUT, 'codex-integration-report.json'),
      JSON.stringify(report, null, 2),
    );
  }
  return report;
}
module.exports = { integrationCheck };
