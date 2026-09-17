'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');

function copyPortableHelper(source, destination) {
  source = fs.realpathSync(source);
  const links = [];
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = fs.realpathSync(file);
        const relative = path.relative(source, target);
        if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep))
          throw new Error('Photo helper link escapes its bundle.');
        links.push({
          file: path.relative(source, file),
          target: relative,
          type: fs.statSync(target).isDirectory() ? 'dir' : 'file',
        });
      } else if (entry.isDirectory()) inspect(file);
    }
  }
  inspect(source);
  fs.cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
  for (const link of links) {
    const file = path.join(destination, link.file);
    fs.unlinkSync(file);
    fs.symlinkSync(
      path.relative(path.dirname(file), path.join(destination, link.target)),
      file,
      link.type,
    );
  }
}

function stageSource(root, destination) {
  root = fs.realpathSync(root);
  const names = fs
    .readFileSync(path.join(root, 'desktop/bundle-files.txt'), 'utf8')
    .trim()
    .split(/\r?\n/);
  if (new Set(names).size !== names.length) throw new Error('Duplicate packaged source path.');
  const manifest = [];
  for (const name of names) {
    if (
      !/^[A-Za-z0-9_./-]+$/.test(name) ||
      name.startsWith('/') ||
      name.split('/').some((part) => !part || part === '..' || part === '.')
    )
      throw new Error('Unsafe packaged source path.');
    const source = path.join(root, name);
    if (fs.realpathSync(source) !== source || !fs.lstatSync(source).isFile())
      throw new Error('Packaged source must be a regular file: ' + name);
    const bytes = fs.readFileSync(source);
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    manifest.push({ path: name, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  fs.writeFileSync(
    path.join(destination, 'package.json'),
    JSON.stringify(
      {
        name: 'codex-appearance-companion',
        version,
        main: 'desktop/main.cjs',
        license: 'MIT',
        description: 'Unofficial Codex appearance companion prototype',
        author: 'Codex Appearance contributors',
      },
      null,
      2,
    ) + '\n',
  );
  fs.writeFileSync(
    path.join(destination, 'bundle-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return { version, manifest };
}

async function build() {
  if (!['darwin', 'win32'].includes(process.platform))
    throw new Error('Build this prototype on macOS or Windows.');
  const base = path.join(ROOT, 'dist/native');
  const source = path.join(base, 'source');
  fs.rmSync(source, { recursive: true, force: true });
  fs.mkdirSync(source, { recursive: true });
  const { version } = stageSource(ROOT, source);
  const helper = path.join(base, 'helper/photo-helper');
  const helperExe = path.join(
    helper,
    process.platform === 'win32' ? 'photo-helper.exe' : 'photo-helper',
  );
  if (!fs.existsSync(helperExe)) throw new Error('Build the bundled photo helper first.');
  const desktopRequire = require('node:module').createRequire(
    path.join(ROOT, 'desktop/package.json'),
  );
  const { packager } = await import(
    require('node:url').pathToFileURL(desktopRequire.resolve('@electron/packager')).href
  );
  const { dependencies } = require('../desktop/package.json');
  const packages = await packager({
    dir: source,
    out: path.join(base, 'packages'),
    overwrite: true,
    name: 'Codex Appearance',
    executableName: 'Codex Appearance',
    platform: process.platform,
    arch: process.arch,
    electronVersion: dependencies.electron,
    // The installed Codex process loads only our reviewed hook by absolute path.
    // Plain companion files avoid assumptions about another Electron's ASAR reader.
    asar: false,
    prune: false,
    appBundleId: 'io.github.skanderbog.codex-appearance',
    appVersion: version,
    buildVersion: version.split('-')[0],
    darwinDarkModeSupport: true,
    win32metadata: {
      CompanyName: 'Codex Appearance contributors',
      FileDescription: 'Unofficial Codex Appearance prototype',
      ProductName: 'Codex Appearance',
    },
  });
  const folder = packages[0];
  const resources =
    process.platform === 'darwin'
      ? path.join(folder, 'Codex Appearance.app/Contents/Resources')
      : path.join(folder, 'resources');
  // Packager's extraResource copier resolves symlinks into build-machine paths.
  // Preserve only links that remain inside the copied helper after relocation.
  copyPortableHelper(helper, path.join(resources, 'photo-helper'));
  const executable =
    process.platform === 'darwin'
      ? path.join(folder, 'Codex Appearance.app/Contents/MacOS/Codex Appearance')
      : path.join(folder, 'Codex Appearance.exe');
  const info = { platform: process.platform, arch: process.arch, version, folder, executable };
  fs.writeFileSync(path.join(base, 'package-info.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(JSON.stringify(info));
}
if (require.main === module)
  build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { stageSource, copyPortableHelper };
