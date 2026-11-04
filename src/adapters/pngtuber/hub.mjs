import { WebSocketServer } from 'ws';
import { helloMessage, parseClientMessage } from './protocol.mjs';

export function createHub({ port = 8791, host = '127.0.0.1', token, logger = console } = {}) {
  let server = null;
  let currentPort = port;
  let lastState = null;
  const clients = new Set();

  function send(socket, payload) {
    if (socket.readyState === 1) socket.send(JSON.stringify(payload));
  }

  function authorized(request) {
    if (!token) return true;
    try {
      const url = new URL(request.url ?? '/', `ws://${host}`);
      return url.searchParams.get('token') === token;
    } catch {
      return false;
    }
  }

  function start() {
    if (server) return Promise.resolve(currentPort);
    return new Promise((resolve, reject) => {
      const next = new WebSocketServer({ port, host });
      const onError = (error) => {
        next.close();
        reject(error);
      };
      next.once('error', onError);
      next.once('listening', () => {
        next.off('error', onError);
        server = next;
        currentPort = next.address().port;
        next.on('connection', (socket, request) => {
          if (!authorized(request)) {
            socket.close(1008, 'token invalido');
            return;
          }
          clients.add(socket);
          socket.on('close', () => clients.delete(socket));
          socket.on('error', () => clients.delete(socket));
          socket.on('message', (raw) => {
            const message = parseClientMessage(raw);
            if (message?.type === 'ping') send(socket, { type: 'pong' });
          });
          send(socket, helloMessage({ port: currentPort }));
          if (lastState) send(socket, lastState);
        });
        next.on('error', (error) => logger.warn?.(`[alba] PNGTuber: ${error.message}`));
        resolve(currentPort);
      });
    });
  }

  async function stop() {
    for (const socket of clients) socket.close(1001, 'adapter cerrado');
    clients.clear();
    if (!server) return;
    const current = server;
    server = null;
    await new Promise((resolve) => current.close(() => resolve()));
  }

  function broadcast(payload) {
    lastState = payload;
    for (const socket of clients) send(socket, payload);
  }

  return {
    start,
    stop,
    broadcast,
    get port() { return currentPort; },
    get clients() { return clients.size; }
  };
}