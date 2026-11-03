import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export class VtsError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'VtsError';
    this.code = code;
  }
}

// Transport only: authentication and reconnect policy belong to the adapter.
export function createVtsClient({ port, requestTimeoutMs = 5000, connectTimeoutMs = 3000 } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('VTS_PORT debe ser un puerto entre 1 y 65535');
  }
  let socket = null;
  let connecting = null;
  const pending = new Map();
  const closeListeners = new Set();

  function rejectPending() {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new VtsError('conexion VTS cerrada', 'DISCONNECTED'));
    }
    pending.clear();
  }

  function connect() {
    if (connecting) return connecting;
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { handshakeTimeout: connectTimeoutMs });
    socket = ws;
    connecting = new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.on('error', () => reject(new VtsError('VTS no disponible; revisa la Plugin API y VTS_PORT', 'CONNECTION')));
      ws.once('close', () => {
        reject(new VtsError('conexion VTS cerrada', 'DISCONNECTED'));
        if (socket !== ws) return;
        socket = null;
        rejectPending();
        for (const listener of closeListeners) listener();
      });
      ws.on('message', (raw) => {
        if (socket !== ws) return;
        let message;
        try { message = JSON.parse(raw.toString()); } catch { return; }
        if (message?.apiName !== 'VTubeStudioPublicAPI' || message.apiVersion !== '1.0') return;
        const entry = pending.get(message.requestID);
        if (!entry) return;
        if (message.messageType !== 'APIError' && message.messageType !== entry.responseType) return;
        clearTimeout(entry.timer);
        pending.delete(message.requestID);
        if (message.messageType === 'APIError') {
          // Never forward server text: it can echo tokens or local filenames.
          entry.reject(new VtsError(`VTS rechazo ${entry.type} (codigo ${message.data?.errorID})`, message.data?.errorID));
        } else {
          entry.resolve(message.data ?? {});
        }
      });
    }).finally(() => { connecting = null; });
    return connecting;
  }

  function request(type, data = {}, { timeoutMs = requestTimeoutMs } = {}) {
    if (socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new VtsError('VTS desconectado', 'DISCONNECTED'));
    }
    const ws = socket;
    const requestID = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestID);
        reject(new VtsError(`VTS no respondio a ${type}`, 'TIMEOUT'));
      }, timeoutMs);
      pending.set(requestID, { resolve, reject, timer, type, responseType: type.replace(/Request$/, 'Response') });
      ws.send(JSON.stringify({
        apiName: 'VTubeStudioPublicAPI', apiVersion: '1.0', requestID, messageType: type, data
      }), (err) => {
        if (!err || !pending.has(requestID)) return;
        clearTimeout(timer);
        pending.delete(requestID);
        reject(new VtsError('no se pudo enviar la peticion a VTS', 'DISCONNECTED'));
      });
    });
  }

  async function disconnect() {
    const ws = socket;
    if (!ws) return;
    // Termination also cancels an in-progress handshake or a stalled request.
    await new Promise((resolve) => {
      ws.once('close', resolve);
      ws.terminate();
    });
  }

  return {
    connect, request, disconnect,
    onClose(listener) { closeListeners.add(listener); return () => closeListeners.delete(listener); },
    get connected() { return socket?.readyState === WebSocket.OPEN; }
  };
}