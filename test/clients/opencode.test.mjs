import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../../clients/opencode/translate.mjs';
import { AlbaPlugin } from '../../clients/opencode/plugin.mjs';
import { createBridgeClient } from '../../clients/http/client.mjs';
import { createBridgeServer } from '../../src/api/server.mjs';
import { normalizeEvent } from '../../src/core/events.mjs';
import { waitFor } from '../fixtures/vts-server.mjs';

test('traduce hooks sin enviar argumentos, resultados ni errores privados', () => {
  const before = translate('tool.execute.before', { tool: 'bash', args: { secret: 'private' } });
  assert.deepEqual(before, normalizeEvent({ source: 'opencode', type: 'tool.start', tool: 'bash' }));
  assert.equal(translate('tool.execute.after', { tool: 'bash' }, { metadata: { exit: 0 }, output: 'private' }).type, 'tool.end');
  assert.equal(translate('tool.execute.after', { tool: 'bash' }, { metadata: { exit: 1 } }).type, 'error');
  assert.equal(translate('event', { event: { type: 'session.idle' } }).type, 'session.idle');
  assert.equal(translate('event', { event: { type: 'session.created' } }).type, 'session.start');
  const failed = translate('event', { event: { type: 'message.part.updated', properties: {
    part: { type: 'tool', tool: 'edit', state: { status: 'error', error: 'private' } }
  } } });
  assert.equal(failed.type, 'error');
  assert.equal(JSON.stringify(failed).includes('private'), false);
  assert.equal(translate('event', { event: { type: 'other' } }), null);
});

test('plugin reenvia por HTTP en orden y autenticado', async (t) => {
  const received = [];
  const server = createBridgeServer({ port: 0, token: 'test-token', getState: () => ({}),
    onEvent: (event) => { received.push(normalizeEvent(event)); } });
  const { port } = await server.start();
  t.after(() => server.stop());
  const hooks = await AlbaPlugin({ albaClient: createBridgeClient({ env: { ALBA_BRIDGE_PORT: port, ALBA_TOKEN: 'test-token' } }) });
  await hooks['tool.execute.before']({ tool: 'edit' }, {});
  await hooks['tool.execute.after']({ tool: 'edit' }, {});
  await hooks.event({ event: { type: 'session.idle' } });
  await waitFor(() => received.length === 3);
  assert.deepEqual(received.map((e) => e.type), ['tool.start', 'tool.end', 'session.idle']);
});

test('bridge caido no bloquea hooks, limita cola y avisa una vez por causa', async () => {
  const warnings = [];
  let reject;
  let attempts = 0;
  const hooks = await AlbaPlugin({
    client: { app: { log: ({ body }) => { warnings.push(body.message); } } },
    albaClient: { event: () => { attempts++; return new Promise((_, fail) => { reject = fail; }); } }
  });
  for (let i = 0; i < 80; i++) await hooks['tool.execute.before']({ tool: 'bash' });
  assert.equal(attempts, 1);
  assert.equal(warnings.length, 1);
  for (let i = 0; i < 33; i++) { reject(new Error('secret')); await new Promise(setImmediate); }
  assert.equal(attempts, 33);
  assert.equal(warnings.length, 2);
  assert.equal(warnings.join().includes('secret'), false);
});

test('cliente no sigue redirecciones ni expone tokens al fallar', async () => {
  const bridge = createBridgeClient({ env: { ALBA_BRIDGE_PORT: 1234, ALBA_TOKEN: 'secret' }, fetchImpl: async (url, opts) => {
    assert.equal(url, 'http://127.0.0.1:1234/state');
    assert.equal(opts.redirect, 'error');
    throw new Error('secret');
  } });
  await assert.rejects(bridge.state(), /Bridge no disponible/);
});
