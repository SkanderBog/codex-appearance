'use strict';
// Opt-in diagnostic for an isolated, unauthenticated Codex profile. Never signs in.
const fs = require('node:fs');
const path = require('node:path');
const { OUTPUT } = require('./paths.cjs');
const { readSettings, saveSettings, DEFAULTS, assetDataURL } = require('./core.cjs');
const { evaluate } = require('./evaluate.cjs');
function photoPixels(bytes) {
  let translucent = 0,
    photo = 0,
    opaque = 0,
    foreground = 0;
  // NativeImage bitmap uses BGRA. Alpha is independent of the pixel colors.
  for (let i = 0; i < bytes.length; i += 4) {
    const blue = bytes[i],
      green = bytes[i + 1],
      red = bytes[i + 2],
      alpha = bytes[i + 3];
    if (alpha > 0 && alpha < 240) {
      translucent++;
      if (alpha >= 100 && alpha <= 200 && (blue > red + 10 || green > red + 10)) photo++;
    }
    if (alpha === 255) {
      opaque++;
      if (Math.abs(red - 249) <= 2 && Math.abs(green - 232) <= 2 && Math.abs(blue - 206) <= 2)
        foreground++;
    }
  }
  return { translucent, photo, opaque, foreground };
}
function nativeColor(value) {
  const hex = String(value).toLowerCase();
  return /^#[a-f0-9]{6}$/.test(hex) ? '#ff' + hex.slice(1) : hex;
}
async function integrationCheck(win, update, native = {}) {
  const original = readSettings();
  const isNative = process.env.COMPANION_NATIVE_ACTIVE === '1';
  const expectedPhoto = isNative ? assetDataURL(original.photo) : '';
  const report = {
    passed: false,
    signedOut: true,
    sentPrompts: 0,
    nativeStartupPhoto: isNative,
    assertions: [],
  };
  const check = (name, passed, detail) => {
    report.assertions.push({ name, passed: !!passed, ...(detail ? { detail } : {}) });
    console.log('[signed-out-check]', name, !!passed);
    if (!passed) throw new Error(name);
  };
  const inspect = () =>
    evaluate(
      win.webContents,
      `(() => {
    const buttons = [...document.querySelectorAll('button,a')].filter(e => /continue|sign in|log in/i.test(e.textContent));
    const login = buttons.find(e => { const r=e.getBoundingClientRect(); return r.width>0 && r.height>0; });
    const r=login?.getBoundingClientRect();
    const target=r && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    const style=document.getElementById('companion-appearance-style');
    const appearance=() => { const body=getComputedStyle(document.body), before=getComputedStyle(document.body,'::before');
      return { foreground:body.color, background:body.backgroundColor, opacity:body.opacity,
        font:body.fontFamily, size:body.fontSize, accent:body.getPropertyValue('--color-text-accent').trim(),
        image:before.backgroundImage==='none' ? 'none' : 'present',
        photo:before.backgroundImage.includes(${JSON.stringify(expectedPhoto || 'not-a-photo')}),
        photoOpacity:before.opacity, fit:before.backgroundSize, crop:before.backgroundPosition,
        tint:body.getPropertyValue('--companion-photo-cover').trim() };
    };
    const styled=appearance();
    // Read underlying app styles synchronously: no frame or settings change.
    const sheet=style?.sheet, disabled=sheet?.disabled;
    let baseline;
    try { if(sheet)sheet.disabled=true; baseline=appearance(); }
    finally { if(sheet)sheet.disabled=disabled; }
    return { login:!!login, reachable:!!login && (target===login || login.contains(target)),
      styled:!!style?.textContent,
      controls:!!document.getElementById('companion-access'),
      appearance:styled, baseline };
  })()`,
    );
  try {
    let initial;
    for (let i = 0; i < 40; i++) {
      initial = await inspect();
      if (initial.login) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    check('Signed-out login control is visible', initial.login);
    if (isNative) {
      check(
        'Saved photo look exists before native Codex startup check',
        original.enabled &&
          original.preset === 'amber' &&
          !original.customColors &&
          original.backgroundMode === 'photo' &&
          !!expectedPhoto &&
          original.opacity === 0.6 &&
          original.photoFit === 'cover' &&
          original.photoX === 28 &&
          original.photoY === 50 &&
          original.photoTint === 0.2 &&
          original.homePhotoStrength === 1 &&
          original.taskPhotoStrength === 1,
      );
      check('Saved appearance is already active before any diagnostic update', initial.styled);
      check(
        'Startup body foreground and accent use the saved amber palette',
        initial.appearance.foreground === 'rgb(249, 232, 206)' &&
          initial.appearance.accent.toUpperCase() === '#F2BD72',
        { foreground: initial.appearance.foreground, accent: initial.appearance.accent },
      );
      check(
        'Startup photo layer uses saved image, opacity, tint and crop',
        initial.appearance.photo &&
          initial.appearance.photoOpacity === '0.6' &&
          initial.appearance.fit.split(',').every((value) => value.trim() === 'cover') &&
          initial.appearance.crop.split(',').every((value) => value.trim() === '28% 50%') &&
          Math.abs(Number(initial.appearance.tint) - 0.2) < 0.001,
        {
          opacity: initial.appearance.photoOpacity,
          fit: initial.appearance.fit,
          crop: initial.appearance.crop,
          tint: initial.appearance.tint,
        },
      );
      check('Startup foreground tree stays fully opaque', initial.appearance.opacity === '1');
      report.nativeBackgroundGetter = typeof win.getBackgroundColor === 'function';
      if (report.nativeBackgroundGetter)
        check(
          'Styled native window background is transparent',
          nativeColor(win.getBackgroundColor()) === '#00000000',
        );
      const shot = await win.webContents.capturePage();
      fs.mkdirSync(OUTPUT, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(OUTPUT, 'native-signed-out-photo.png'), shot.toPNG());
      const pixels = photoPixels(shot.toBitmap());
      report.photoPixels = pixels;
      check(
        'Native screenshot retains translucent photo background',
        pixels.translucent > 10000 && pixels.photo > 1000,
        pixels,
      );
      check('Native screenshot retains opaque amber foreground pixels', pixels.foreground > 50, {
        foreground: pixels.foreground,
        opaque: pixels.opaque,
      });
    } else {
      saveSettings({ ...DEFAULTS, preset: 'amber', enabled: true });
      await update();
    }
    let state = await inspect();
    check('Appearance layer applies before sign-in', state.styled);
    check('Sign-in remains reachable while styled', state.reachable);
    check('Appearance remains enabled after layout validation', readSettings().enabled);
    const baseline = state.baseline;
    saveSettings({ ...readSettings(), enabled: false });
    await update();
    state = await inspect();
    check('No look removes the signed-out appearance layer', !state.styled && !state.controls);
    check('Sign-in remains reachable with No look', state.reachable);
    if (isNative) {
      const restored = [
        'foreground',
        'background',
        'opacity',
        'font',
        'size',
        'accent',
        'image',
      ].every((key) => state.appearance[key] === baseline[key]);
      check('No look restores the underlying Codex computed appearance', restored, {
        restored,
        photoRemoved: !state.appearance.photo,
        image: state.appearance.image,
      });
      check(
        'No look removes the saved photo layer',
        !state.appearance.photo && state.appearance.image === baseline.image,
      );
      if (report.nativeBackgroundGetter) {
        check(
          'Original native window background is available for comparison',
          typeof native.originalBackground === 'function',
        );
        check(
          'No look restores the original native window background',
          nativeColor(win.getBackgroundColor()) === nativeColor(native.originalBackground()),
        );
      }
      fs.writeFileSync(
        path.join(OUTPUT, 'native-signed-out-no-look.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
    }
    report.passed = true;
  } catch (error) {
    report.error = error.message;
  } finally {
    saveSettings(original);
    await update();
    fs.mkdirSync(OUTPUT, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(OUTPUT, 'signed-out-report.json'), JSON.stringify(report, null, 2));
  }
  return report;
}
module.exports = { integrationCheck, photoPixels };
