import http from 'node:http';
import { log, error } from '../core/log.mjs';

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('cuerpo demasiado grande'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('JSON invalido'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function isJson(req) {
  const header = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  return header === 'application/json';
}

export function createBridgeServer({
  port = 8790,
  host = '127.0.0.1',
  token,
  getState,
  subscribe,
  onEvent,
  onIntent,
  logger = { log, error }
} = {}) {
  if (host !== '127.0.0.1') throw new Error('El bridge solo puede escuchar en 127.0.0.1');
  const streams = new Set();
  const sockets = new Set();
  let heartbeat = null;

  function authorize(req, res) {
    if (req.headers.origin !== undefined) {
      sendJson(res, 403, { ok: false, error: 'origen de navegador no permitido' });
      return false;
    }
    if (!token) {
      sendJson(res, 503, { ok: false, error: 'ALBA_TOKEN no esta configurado en .env' });
      return false;
    }
    if (req.headers['x-alba-token'] !== token) {
      sendJson(res, 401, { ok: false, error: 'token invalido' });
      return false;
    }
    return true;
  }

  function broadcast(payload) {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of streams) {
      try {
        res.write(line);
      } catch {
        streams.delete(res);
      }
    }
  }

  function handleStream(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive'
    });
    res.write(`data: ${JSON.stringify(getState())}\n\n`);
    streams.add(res);
    const unsubscribe = subscribe?.((payload) => {
      if (!res.destroyed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
    req.on('close', () => {
      streams.delete(res);
      unsubscribe?.();
    });
  }

  async function handlePost(req, res, handler) {
    if (!isJson(req)) {
      sendJson(res, 415, { ok: false, error: 'Content-Type debe ser application/json' });
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendJson(res, err.statusCode ?? 400, { ok: false, error: err.message });
      return;
    }
    try {
      const result = (await handler(body)) ?? {};
      sendJson(res, 200, { ok: true, state: getState(), ...result });
    } catch (err) {
      const status = err.name === 'EventError' || err.name === 'SchemaError' ? 400 : err.statusCode ?? 500;
      if (status >= 500) logger.error('error interno:', err.message);
      sendJson(res, status, { ok: false, error: err.message });
    }
  }

  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url ?? '/', 'http://127.0.0.1'); }
    catch { sendJson(res, 400, { ok: false, error: 'URL invalida' }); return; }
    const route = `${req.method} ${url.pathname}`;

    if (!authorize(req, res)) return;

    if (route === 'GET /state') {
      sendJson(res, 200, { ok: true, state: getState() });
      return;
    }
    if (route === 'GET /stream') {
      handleStream(req, res);
      return;
    }
    if (route === 'POST /event') {
      if (!onEvent) {
        sendJson(res, 501, { ok: false, error: 'onEvent no configurado' });
        return;
      }
      handlePost(req, res, onEvent);
      return;
    }
    if (route === 'POST /intent') {
      if (!onIntent) {
        sendJson(res, 501, { ok: false, error: 'onIntent no configurado' });
        return;
      }
      handlePost(req, res, onIntent);
      return;
    }
    if (url.pathname === '/event' || url.pathname === '/intent' || url.pathname === '/state' || url.pathname === '/stream') {
      sendJson(res, 405, { ok: false, error: `metodo no permitido: ${req.method}` });
      return;
    }
    sendJson(res, 404, { ok: false, error: 'ruta no encontrada' });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  function start() {
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        server.off('error', onError);
        reject(err);
      };
      server.once('error', onError);
      server.listen(port, host, () => {
        server.off('error', onError);
        heartbeat = setInterval(() => broadcast({ heartbeat: true }), 25000);
        heartbeat.unref?.();
        const address = server.address();
        resolve(address && typeof address === 'object' ? address : { port, address: host });
      });
    });
  }

  function stop() {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    for (const res of streams) {
      try {
        res.end();
      } catch {
        // conexion ya cerrada
      }
    }
    streams.clear();
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  function address() {
    const value = server.address();
    return value && typeof value === 'object' ? value : null;
  }

  return { server, start, stop, address, broadcast };
}
