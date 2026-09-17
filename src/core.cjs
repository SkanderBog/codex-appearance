'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, STATE } = require('./paths.cjs');
const SETTINGS = path.join(STATE, 'appearance.json');
const ASSETS = path.join(STATE, 'backgrounds');
const PRESETS = Object.freeze(
  Object.fromEntries(
    [
      ['graphite', 'Graphite', 'Quiet charcoal', '#11171C', '#EDF3F5', '#91D6BD'],
      ['phosphor', 'Phosphor', 'Classic green terminal', '#0B1812', '#D6F5DE', '#86E3A0'],
      ['amber', 'Amber', 'Warm amber glow', '#1B1510', '#F9E8CE', '#F2BD72'],
      ['dusk', 'Dusk', 'Lavender after dark', '#141625', '#EBE9FC', '#B7A8EF'],
      ['ocean', 'Ocean', 'Deep blue · sea glass', '#081C29', '#E0F3FA', '#64D8D4'],
      ['rose', 'Rosewood', 'Burgundy · dusty rose', '#25161D', '#FBE8EE', '#F2A1B7'],
      ['nord', 'Nord', 'Arctic blue · frost', '#242C3A', '#E5EDF6', '#88C0D0'],
      ['mocha', 'Mocha', 'Coffee · cream', '#231C19', '#F5E9DE', '#D9AF88'],
      ['orchid', 'Orchid', 'Ink violet · lilac', '#21152B', '#F3E8FC', '#D4A0F1'],
      ['solar', 'Solar', 'Teal · golden light', '#002B36', '#E5E7CE', '#E9BE55'],
      ['tokyo', 'Tokyo', 'Midnight · neon blue', '#171A2B', '#D8DFFA', '#80AAFF'],
      ['forest', 'Forest', 'Moss · fern', '#152019', '#E7F0DC', '#B2CB87'],
      ['cherry', 'Cherry', 'Charcoal · coral', '#21171A', '#F9E8E6', '#FF9587'],
      ['cobalt', 'Cobalt', 'Blue hour · electric', '#101D37', '#E5EDFF', '#82B8FF'],
      ['sand', 'Sandstone', 'Earth · soft gold', '#24221B', '#F5EFDC', '#DBC786'],
      ['mono', 'Monochrome', 'Pure charcoal · silver', '#151515', '#F0F0F0', '#CCCCCC'],
    ].map(([id, name, description, background, foreground, accent]) => [
      id,
      { name, description, background, foreground, accent },
    ]),
  ),
);
const FONTS = Object.freeze(
  process.platform === 'darwin'
    ? {
        mono: 'Menlo',
        liberation: 'Monaco',
        nimbus: 'Courier',
        sans: 'Helvetica Neue',
        serif: 'Georgia',
      }
    : process.platform === 'win32'
      ? {
          mono: 'Consolas',
          liberation: 'Courier New',
          nimbus: 'Lucida Console',
          sans: 'Segoe UI',
          serif: 'Georgia',
        }
      : {
          mono: 'DejaVu Sans Mono',
          liberation: 'Liberation Mono',
          nimbus: 'Nimbus Mono PS',
          sans: 'DejaVu Sans',
          serif: 'DejaVu Serif',
        },
);
const DEFAULTS = Object.freeze({
  version: 3,
  preset: 'graphite',
  customColors: false,
  background: '#11171C',
  foreground: '#EDF3F5',
  accent: '#91D6BD',
  opacity: 0.82,
  backgroundMode: 'solid',
  photo: '',
  photoName: '',
  photoFit: 'cover',
  photoX: 50,
  photoY: 50,
  photoTint: 0.35,
  photoBlur: 0,
  homePhotoStrength: 1,
  taskPhotoStrength: 1,
  sidebarOpacity: 0,
  headerOpacity: 0,
  composerOpacity: 0,
  readingOpacity: 0,
  gradientColor: '#2A4A54',
  gradientAngle: 135,
  font: 'mono',
  fontSize: 14,
  codeSize: 13,
  lineHeight: 1.6,
  terminalMode: true,
  contentWidth: 'wide',
  reducedMotion: false,
  enabled: true,
});
const ASSET_PATTERN = /^[a-f0-9]{64}\.jpg$/;
function normalize(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const s = { ...DEFAULTS };
  for (const key of ['customColors', 'terminalMode', 'reducedMotion', 'enabled'])
    if (typeof value[key] === 'boolean') s[key] = value[key];
  const choices = {
    preset: Object.keys(PRESETS),
    font: Object.keys(FONTS),
    backgroundMode: ['solid', 'gradient', 'photo'],
    photoFit: ['cover', 'contain'],
    contentWidth: ['comfortable', 'wide', 'full'],
  };
  for (const [k, options] of Object.entries(choices))
    if (options.includes(value[k])) s[k] = value[k];
  for (const [k, lo, hi] of [
    ['opacity', 0.35, 1],
    ['fontSize', 11, 26],
    ['codeSize', 10, 24],
    ['lineHeight', 1.25, 2],
    ['photoX', 0, 100],
    ['photoY', 0, 100],
    ['photoTint', 0, 0.9],
    ['photoBlur', 0, 24],
    ['homePhotoStrength', 0, 1],
    ['taskPhotoStrength', 0, 1],
    ['sidebarOpacity', 0, 1],
    ['headerOpacity', 0, 1],
    ['composerOpacity', 0, 1],
    ['readingOpacity', 0, 1],
    ['gradientAngle', 0, 360],
  ]) {
    const n = value[k];
    if (typeof n === 'number' && Number.isFinite(n)) s[k] = Math.max(lo, Math.min(hi, n));
  }
  for (const k of ['fontSize', 'codeSize', 'photoX', 'photoY', 'photoBlur', 'gradientAngle'])
    s[k] = Math.round(s[k]);
  for (const k of ['background', 'foreground', 'accent', 'gradientColor'])
    if (typeof value[k] === 'string' && /^#[0-9a-f]{6}$/i.test(value[k]))
      s[k] = value[k].toUpperCase();
  if (typeof value.photo === 'string' && ASSET_PATTERN.test(value.photo)) s.photo = value.photo;
  if (typeof value.photoName === 'string')
    s.photoName = value.photoName.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120);
  return s;
}
function readSettings() {
  try {
    return normalize(JSON.parse(fs.readFileSync(SETTINGS, 'utf8')));
  } catch {
    return { ...DEFAULTS };
  }
}
function atomicJSON(file, value) {
  // Do not silently destroy malformed user data when recovering with defaults.
  if (fs.existsSync(file)) {
    const original = fs.readFileSync(file);
    try {
      JSON.parse(original.toString('utf8'));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      const backup = `${file}.corrupt-${Date.now()}-${process.pid}`;
      fs.writeFileSync(backup, original, { mode: 0o600, flag: 'wx' });
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function saveSettings(value) {
  const result = normalize(value);
  // Preserve the first pre-upgrade settings, even if the machine loses power during migration.
  if (fs.existsSync(SETTINGS)) {
    try {
      const oldVersion = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).version;
      const backup = path.join(STATE, `appearance-v${oldVersion}-backup.json`);
      if ([1, 2].includes(oldVersion) && !fs.existsSync(backup))
        fs.copyFileSync(SETTINGS, backup, fs.constants.COPYFILE_EXCL);
    } catch {}
  }
  atomicJSON(SETTINGS, result);
  return result;
}
function paletteFor(value) {
  const s = normalize(value);
  return s.customColors
    ? { name: 'Custom', background: s.background, foreground: s.foreground, accent: s.accent }
    : PRESETS[s.preset];
}
// Keep only one small encoded photo; validate its file identity on every use.
// Large imports remain supported without retaining a large permanent cache.
let photoCache;
function assetDataURL(id) {
  if (!ASSET_PATTERN.test(id)) return '';
  try {
    const file = path.join(ASSETS, id);
    const stat = fs.lstatSync(file, { bigint: true });
    if (!stat.isFile() || stat.size > 20n * 1024n * 1024n) {
      photoCache = null;
      return '';
    }
    const key = [id, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
    if (photoCache?.key === key) return photoCache.value;
    photoCache = null;
    const value = 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64');
    if (value.length <= 8 * 1024 * 1024) photoCache = { key, value };
    return value;
  } catch {
    photoCache = null;
    return '';
  }
}
function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
}
function cssFor(value, { codex = false, embedded = false } = {}) {
  const requested = normalize(value);
  if (!requested.enabled && codex) return '';
  // A paused look is retained in settings, but should not remain visible in
  // either preview. Use a neutral, opaque sample for the native-style state.
  const s = requested.enabled ? requested : { ...DEFAULTS, enabled: false },
    p = paletteFor(s);
  const alpha = s.enabled ? s.opacity : 1;
  const photo = s.backgroundMode === 'photo' ? assetDataURL(s.photo) : '';
  const image = photo
    ? `linear-gradient(rgba(${rgb(p.background)}, var(--companion-photo-cover)), rgba(${rgb(p.background)}, var(--companion-photo-cover))), url("${photo}")`
    : s.backgroundMode === 'gradient'
      ? `linear-gradient(${s.gradientAngle}deg, ${p.background}, ${s.gradientColor})`
      : '';
  const bg = image ? 'transparent' : `rgba(${rgb(p.background)}, ${alpha})`;
  const scope = embedded ? '#sampleWindow' : ':root';
  const surface = embedded ? '#sampleWindow' : codex ? 'body' : '.terminal';
  const font = `'${FONTS[s.font]}', ${['sans', 'serif'].includes(s.font) ? (s.font === 'sans' ? 'sans-serif' : 'serif') : 'monospace'}`;
  let css = `${scope} { --companion-bg:${bg}; --companion-solid:${p.background}; --companion-fg:${p.foreground}; --companion-accent:${p.accent}; --companion-font-size:${s.fontSize}px; --companion-font:${font}; --companion-line-height:${s.lineHeight}; --companion-code-size:${s.codeSize}px; color-scheme:dark; }
${scope} { --companion-photo-cover:${1 - s.taskPhotoStrength * (1 - s.photoTint)}; }
${codex ? 'html[data-companion-route="home"]' : embedded ? '#sampleWindow[data-preview-route="home"]' : 'html[data-preview-route="home"]'} { --companion-photo-cover:${1 - s.homePhotoStrength * (1 - s.photoTint)}; }
${embedded ? '' : 'html, body { background: transparent !important; } body { color:var(--companion-fg) !important; }'}
${surface} { background: var(--companion-bg) !important; position:relative; isolation:isolate; }
${image ? `${surface}::before { content:""; position:absolute; inset:0; z-index:-1; pointer-events:none; background-color:${p.background}; background-image:${image}; background-size:${s.photoFit}; background-position:${s.photoX}% ${s.photoY}%; background-repeat:no-repeat; opacity:${alpha}; ${photo && s.photoBlur ? `filter:blur(${s.photoBlur}px);` : ''} }` : ''}
`;
  const surfaces = codex
    ? [
        '.app-shell-left-panel',
        '[class*="_ApplicationMenuTopBar_"]',
        '[data-codex-composer-root]',
        '[data-content-search-unit-key]:not([data-content-search-unit-key] [data-content-search-unit-key])',
      ]
    : embedded
      ? [
          '#sample-sidebar',
          '#sampleWindow .sample-bar',
          '#sampleWindow .sample-input',
          '#sampleWindow .sample-answer',
        ]
      : ['.preview-sidebar', '.terminal > header', '.terminal .input', '.terminal .sample-answer'];
  for (const [index, key] of [
    'sidebarOpacity',
    'headerOpacity',
    'composerOpacity',
    'readingOpacity',
  ].entries()) {
    if (s.enabled && s[key] > 0)
      css += `${surfaces[index]} { background-color:rgba(${rgb(p.background)}, ${s[key]}) !important; }\n`;
  }
  if (!codex) return css;
  css += `:root, :root body, :root .electron-dark, :root .electron-light {
 --color-background-surface:transparent !important; --color-background-surface-under:transparent !important;
 --color-token-main-surface-primary:transparent !important; --color-token-bg-primary:transparent !important;
 --color-token-bg-secondary:transparent !important; --color-token-bg-tertiary:transparent !important;
 --color-token-side-bar-background:transparent !important; --color-background-sidebar:transparent !important;
 --color-background-elevated:var(--companion-solid) !important; --color-background-application-menu:var(--companion-solid) !important;
 --color-text-foreground:var(--companion-fg) !important; --color-token-foreground:var(--companion-fg) !important; --color-text-primary:var(--companion-fg) !important; --color-text-accent:var(--companion-accent) !important;
 --color-text:var(--companion-fg) !important;
 --app-color-text-foreground:var(--companion-fg) !important; --app-color-text-accent:var(--companion-accent) !important;
 --app-color-background-surface:transparent !important; --app-color-background-surface-under:transparent !important;
 --app-color-background-elevated-primary:var(--companion-solid) !important; --app-color-background-elevated-secondary:var(--companion-solid) !important;
 --app-color-background-application-menu:var(--companion-solid) !important;
 --font-sans:${font} !important; --font-sans-default:${font} !important; --font-mono:'DejaVu Sans Mono',monospace !important;
 --font-ui-family:${font} !important;
 --codex-chat-font-size:${s.fontSize}px !important; --codex-chat-code-font-size:${s.codeSize}px !important; --text-base:${s.fontSize}px !important;
 --thread-content-max-width:${{ comfortable: '48rem', wide: '76rem', full: '100%' }[s.contentWidth]} !important;
 --line-height-composer:${Number((s.fontSize * s.lineHeight).toFixed(2))}px !important;
}
body { font-family:var(--font-sans) !important; }
body::before { position:fixed; }
#root { background:transparent !important; }
[class*="_MarkdownRoot_"] { --markdown-line-height:${Number((s.fontSize * s.lineHeight).toFixed(2))}px !important; }
/* The supported Codex build reserves 300px plus a 16px gutter for its pinned
   summary. Recompute at each width-bearing element to use its inherited live
   animation shift, including the separately translated composer. Popovers do
   not match this floating-panel selector and keep the requested width. */
div:has(> [class*="top-(--thread-floating-content-top-inset)"] [data-pip-obstacle="thread-summary-panel"]) { --companion-summary-space:316px; }
[style*="--thread-content-max-width"], [class*="--thread-content-max-width"] {
 --thread-content-max-width:min(${{ comfortable: '48rem', wide: '76rem', full: '100%' }[s.contentWidth]}, max(0px, calc(100% - 2 * max(var(--thread-wide-block-inline-shift, 0px), calc(var(--companion-summary-space, 0px) - var(--thread-wide-block-inline-shift, 0px)))))) !important;
}
[role="menu"], [role="dialog"], [data-radix-popper-content-wrapper] { background-color:var(--companion-solid) !important; }
${s.terminalMode ? 'html:not([data-companion-reveal]) [data-companion-panel] { display: none !important; }' : ''}
${s.reducedMotion ? '*, *::before, *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; scroll-behavior:auto !important; }' : ''}
#companion-access { position:static; display:flex; flex-shrink:0; align-items:center; margin-inline:6px; -webkit-app-region:no-drag; }
#companion-access button { border:1px solid #ffffff2b; color:${p.foreground}; background:${p.background}; border-radius:6px; padding:5px 9px; font:11px 'DejaVu Sans Mono',monospace; cursor:pointer; }
`;
  return css;
}
function themeString(value) {
  const s = normalize(value),
    p = paletteFor(s);
  return (
    'codex-theme-v1:' +
    JSON.stringify({
      variant: 'dark',
      codeThemeId: 'codex',
      theme: {
        accent: p.accent,
        surface: p.background,
        ink: p.foreground,
        contrast: 60,
        opaqueWindows: false,
        fonts: { ui: FONTS[s.font], code: 'DejaVu Sans Mono' },
        semanticColors: { diffAdded: '#86E3A0', diffRemoved: '#F28B82', skill: p.accent },
      },
    })
  );
}
module.exports = {
  ROOT,
  STATE,
  SETTINGS,
  ASSETS,
  ASSET_PATTERN,
  PRESETS,
  FONTS,
  DEFAULTS,
  normalize,
  readSettings,
  saveSettings,
  atomicJSON,
  paletteFor,
  assetDataURL,
  cssFor,
  themeString,
};
