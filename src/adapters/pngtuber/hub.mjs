import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { helloMessage, parseClientMessage } from './protocol.mjs';

function sameToken(given, expected) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createHub({ port = 8791, host = '127.0.0.1', token, logger = console } = {}) {
  if (host !== '127.0.0.1') throw new Error('El hub PNGTuber solo puede escuchar en 127.0.0.1');
  let server = null;
  let currentPort = port;
  let lastState = null;
  const clients = new Set();

  function send(socket, payload) {
    if (socket.readyState === 1) socket.send(JSON.stringify(payload));
  }

  // Igual que el bridge HTTP: nada de paginas web (Origin) y token si hay uno.
  function rejection(request) {
    if (request.headers.origin !== undefined) return 'origen de navegador no permitido';
    if (!token) return null;
    try {
      const url = new URL(request.url ?? '/', `ws://${host}`);
      return sameToken(url.searchParams.get('token'), token) ? null : 'token invalido';
    } catch {
      return 'token invalido';
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
          const reason = rejection(request);
          if (reason) {
            socket.close(1008, reason);
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

  // Estado persistente: se reenvia a quien se conecte tarde.
  function broadcast(payload) {
    lastState = payload;
    notify(payload);
  }

  // Mensaje puntual (p. ej. el globo de dialogo): no reemplaza el ultimo estado.
  function notify(payload) {
    for (const socket of clients) send(socket, payload);
  }

  return {
    start,
    stop,
    broadcast,
    notify,
    get port() { return currentPort; },
    get clients() { return clients.size; }
  };
}
