'use strict';
const net = require('node:net');
function inspectorEndpoint(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'ws:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    !/^\/[\w-]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error('Rejected non-local inspector endpoint.');
  return url;
}
async function connectInspector(endpoint, WebSocketImpl = WebSocket) {
  inspectorEndpoint(endpoint);
  const socket = new WebSocketImpl(endpoint);
  const pending = new Map(),
    events = new Map();
  let serial = 0;
  const fail = () => {
    for (const item of pending.values()) item.reject(new Error('Native inspector disconnected.'));
    pending.clear();
  };
  socket.addEventListener('close', fail);
  socket.addEventListener('message', ({ data }) => {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    } else events.get(message.method)?.(message.params);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Native inspector connection timed out.'));
    }, 10000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('Native inspector connection failed.'));
      },
      { once: true },
    );
  });
  return {
    on(name, listener) {
      events.set(name, listener);
    },
    send(method, params = {}) {
      const id = ++serial;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Native inspector timed out: ${method}`));
        }, 10000);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
      fail();
    },
  };
}
async function waitForInspectorClosed(endpoint, timeout = 10000) {
  const url = inspectorEndpoint(endpoint),
    end = Date.now() + timeout;
  while (Date.now() < end) {
    const open = await new Promise((resolve) => {
      const connection = net.connect({ host: '127.0.0.1', port: Number(url.port) });
      const finish = (value) => {
        connection.destroy();
        resolve(value);
      };
      connection.once('connect', () => finish(true));
      connection.once('error', () => finish(false));
      connection.setTimeout(500, () => finish(true));
    });
    if (!open) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Native inspector did not close; the prototype launch was stopped.');
}
module.exports = { inspectorEndpoint, connectInspector, waitForInspectorClosed };
