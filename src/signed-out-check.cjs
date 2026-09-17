'use strict';
// Opt-in diagnostic for an isolated, unauthenticated Codex profile. Never signs in.
const fs = require('node:fs');
const path = require('node:path');
const { OUTPUT } = require('./paths.cjs');
const { readSettings, saveSettings, DEFAULTS } = require('./core.cjs');
const { evaluate } = require('./evaluate.cjs');
async function integrationCheck(win, update) {
  const original = readSettings();
  const report = { passed: false, signedOut: true, sentPrompts: 0, assertions: [] };
  const check = (name, passed) => {
    report.assertions.push({ name, passed: !!passed });
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
    return { login:!!login, reachable:!!login && (target===login || login.contains(target)),
      styled:!!document.getElementById('companion-appearance-style')?.textContent,
      controls:!!document.getElementById('companion-access'),
      accent:getComputedStyle(document.body).getPropertyValue('--color-token-text-accent').trim() };
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
    saveSettings({ ...DEFAULTS, preset: 'amber', enabled: true });
    await update();
    let state = await inspect();
    check('Appearance layer applies before sign-in', state.styled);
    check('Sign-in remains reachable while styled', state.reachable);
    check('Appearance remains enabled after layout validation', readSettings().enabled);
    saveSettings({ ...readSettings(), enabled: false });
    await update();
    state = await inspect();
    check('No look removes the signed-out appearance layer', !state.styled && !state.controls);
    check('Sign-in remains reachable with No look', state.reachable);
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
module.exports = { integrationCheck };
