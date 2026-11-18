import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeServer } from '../../src/api/server.mjs';
import { normalizeEvent, validateIntent, EventError } from '../../src/core/events.mjs';

const TOKEN = 'test-token';
const state = {
  asleep: false,
  deepSleep: false,
  base: 'idle',
  activity: null,
  transient: null,
  effective: 'idle',
  props: [],
  updatedAt: 0
};

const known = new Set(['idle', 'coding', 'celebrate', 'sleep', 'wake']);

function buildServer() {
  return createBridgeServer({
    port: 0,
    token: TOKEN,
    getState: () => state,
    subscribe: () => () => {},
    onEvent: (raw) => ({ event: normalizeEvent(raw) }),
    onIntent: (raw) => ({ intent: validateIntent(raw?.intent, known) }),
    logger: { log() {}, error() {} }
  });
}

async function withServer(fn) {
  const bridge = buildServer();
  const address = await bridge.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await fn(base);
  } finally {
    await bridge.stop();
  }
}

function headers(extra = {}) {
  return { 'X-Alba-Token': TOKEN, 'Content-Type': 'application/json', ...extra };
}

test('rechaza peticiones sin token', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/state`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
  });
});

test('rechaza peticiones con Origin de navegador', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/intent`, {
      method: 'POST',
      headers: headers({ Origin: 'https://evil.example' }),
      body: JSON.stringify({ intent: 'coding' })
    });
    assert.equal(res.status, 403);
  });
});

test('rechaza Origin vacio y configuracion de escucha externa', async () => {
  assert.throws(() => createBridgeServer({ host: '0.0.0.0' }), /127.0.0.1/);
  await withServer(async (base) => {
    const res = await fetch(`${base}/state`, { headers: headers({ Origin: '' }) });
    assert.equal(res.status, 403);
  });
});

test('dos clientes SSE reciben cada cambio una sola vez', async () => {
  const listeners = new Set();
  const bridge = createBridgeServer({ port: 0, token: TOKEN, getState: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } });
  const { port } = await bridge.start();
  const controllers = [new AbortController(), new AbortController()];
  try {
    const readers = await Promise.all(controllers.map(async (controller) => {
      const response = await fetch(`http://127.0.0.1:${port}/stream`, { headers: headers(), signal: controller.signal });
      const reader = response.body.getReader();
      await reader.read();
      return reader;
    }));
    for (const listener of listeners) listener({ effective: 'coding' });
    for (const reader of readers) {
      const chunk = new TextDecoder().decode((await reader.read()).value);
      assert.equal(chunk.split('data: ').length - 1, 1);
    }
  } finally { controllers.forEach((c) => c.abort()); await bridge.stop(); }
});

test('exige Content-Type application/json', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/intent`, {
      method: 'POST',
      headers: { 'X-Alba-Token': TOKEN, 'Content-Type': 'text/plain' },
      body: JSON.stringify({ intent: 'coding' })
    });
    assert.equal(res.status, 415);
  });
});

test('acepta una intencion valida', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/intent`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ intent: 'coding' })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.intent, 'coding');
    assert.equal(body.state.effective, 'idle');
  });
});

test('acepta un evento canonico valido', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/event`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ source: 'test', type: 'tool.start', tool: 'bash' })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.event.type, 'tool.start');
  });
});

test('devuelve 400 ante un evento invalido', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/event`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ type: 'nope' })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /type debe ser/);
  });
});

test('devuelve 400 ante JSON roto', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/intent`, {
      method: 'POST',
      headers: headers(),
      body: '{ roto'
    });
    assert.equal(res.status, 400);
  });
});

test('devuelve 405 si el metodo no corresponde', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/intent`, { headers: { 'X-Alba-Token': TOKEN } });
    assert.equal(res.status, 405);
  });
});

test('devuelve 404 en rutas desconocidas', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/nope`, { headers: { 'X-Alba-Token': TOKEN } });
    assert.equal(res.status, 404);
  });
});

test('GET /stream abre SSE y envia el estado inicial', async () => {
  await withServer(async (base) => {
    const controller = new AbortController();
    const res = await fetch(`${base}/stream`, {
      headers: { 'X-Alba-Token': TOKEN },
      signal: controller.signal
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const reader = res.body.getReader();
    const chunk = await reader.read();
    const text = new TextDecoder().decode(chunk.value);
    assert.match(text, /^data: /);
    assert.match(text, /"effective":"idle"/);
    controller.abort();
    await reader.cancel().catch(() => {});
  });
});

test('el EventError se traduce a 400', async () => {
  const bridge = createBridgeServer({
    port: 0,
    token: TOKEN,
    getState: () => state,
    subscribe: () => () => {},
    onIntent: () => {
      throw new EventError('boom');
    },
    logger: { log() {}, error() {} }
  });
  const address = await bridge.start();
  try {
    const res = await fetch(`http://127.0.0.1:${address.port}/intent`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ intent: 'coding' })
    });
    assert.equal(res.status, 400);
  } finally {
    await bridge.stop();
  }
});
