'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Run at most one apply and one pending refresh. Each refresh reads the latest
// settings, rather than replaying intermediate slider positions.
function coalesceUpdates(apply) {
  let running = null,
    pending = false;
  return () => {
    pending = true;
    if (!running)
      running = Promise.resolve().then(async () => {
        try {
          do {
            pending = false;
            await apply();
          } while (pending);
        } finally {
          running = null;
        }
      });
    return running;
  };
}

function watchSettings(file, changed) {
  let watcher,
    timer,
    polling = false,
    closed = false;
  const schedule = () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(changed, 40);
    timer.unref();
  };
  const fallback = () => {
    watcher?.close();
    if (closed || polling) return;
    polling = true;
    fs.watchFile(file, { interval: 2000, persistent: false }, schedule);
    schedule();
  };
  try {
    // Watch the directory: saves replace the file atomically, changing its inode.
    watcher = fs.watch(path.dirname(file), { persistent: false }, (_event, name) => {
      if (!name || String(name) === path.basename(file)) schedule();
    });
    watcher.on('error', fallback);
  } catch {
    fallback();
  }
  return () => {
    closed = true;
    clearTimeout(timer);
    watcher?.close();
    if (polling) fs.unwatchFile(file, schedule);
  };
}
module.exports = { coalesceUpdates, watchSettings };
