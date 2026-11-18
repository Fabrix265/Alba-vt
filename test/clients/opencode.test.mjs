import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator, translate } from '../../clients/opencode/translate.mjs';
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

test('refleja las fases de opencode: ocupado, pensar, responder y reposo, una vez por fase', () => {
  const t = createTranslator();
  const event = (type, properties) => t('event', { event: { type, properties } });
  const part = (p) => event('message.part.updated', { part: { sessionID: 's1', ...p }, delta: 'texto privado' });
  const types = [];
  const push = (value) => { for (const e of value ? [value].flat() : []) types.push(e.type); return value; };

  push(event('session.status', { sessionID: 's1', status: { type: 'busy' } }));
  push(event('session.status', { sessionID: 's1', status: { type: 'busy' } }));
  // El mensaje del usuario no hace hablar a Alba.
  push(event('message.updated', { info: { id: 'u1', role: 'user' } }));
  push(part({ id: 'pu', messageID: 'u1', type: 'text', text: 'mi pregunta privada' }));
  push(event('message.updated', { info: { id: 'a1', role: 'assistant' } }));
  push(part({ id: 'st1', messageID: 'a1', type: 'step-start' }));
  push(part({ id: 'r1', messageID: 'a1', type: 'reasoning', text: 'privado', time: { start: 1 } }));
  push(part({ id: 'r1', messageID: 'a1', type: 'reasoning', text: 'privado mas', time: { start: 1 } }));
  push(part({ id: 't1', messageID: 'a1', type: 'text', text: 'Hola', time: { start: 2 } }));
  const repeated = part({ id: 't1', messageID: 'a1', type: 'text', text: 'Hola mundo', time: { start: 2 } });
  assert.equal(repeated, null, 'cada trozo de texto no genera un evento nuevo');
  const end = push(part({ id: 't1', messageID: 'a1', type: 'text', text: 'Hola mundo.', time: { start: 2, end: 3 } }));
  // Tras una herramienta, un paso nuevo vuelve a ser "pensando".
  push(t('tool.execute.before', { tool: 'write', sessionID: 's1' }));
  push(part({ id: 'st2', messageID: 'a1', type: 'step-start' }));
  push(event('session.status', { sessionID: 's1', status: { type: 'idle' } }));
  push(event('session.idle', { sessionID: 's1' }));

  assert.deepEqual(types, ['session.busy', 'reasoning', 'response.start', 'response.end', 'tool.start', 'reasoning', 'session.idle']);
  assert.equal(JSON.stringify(end).includes('Hola'), false);
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

test('con speakResponses, Alba dice la respuesta frase a frase y sin codigo', () => {
  const t = createTranslator({ speakResponses: true });
  const text = (value, end) => t('event', { event: { type: 'message.part.updated', properties: {
    part: { id: 't1', sessionID: 's1', messageID: 'a1', type: 'text', text: value, time: end ? { start: 1, end: 2 } : { start: 1 } }
  } } });
  t('event', { event: { type: 'message.updated', properties: { info: { id: 'a1', role: 'assistant' } } } });
  const flat = (value) => (value ? [value].flat() : []);
  const said = [];
  const collect = (value) => { for (const e of flat(value)) if (e.type === 'say') said.push(e.text); return flat(value).map((e) => e.type); };
  assert.deepEqual(collect(text('Hola, ya ', false)), ['response.start']);
  collect(text('Hola, ya lo hice. Mira:\n```js\nconst secreto = 1;\n', false));
  collect(text('Hola, ya lo hice. Mira:\n```js\nconst secreto = 1;\n```\nTodo **listo**', false));
  assert.deepEqual(collect(text('Hola, ya lo hice. Mira:\n```js\nconst secreto = 1;\n```\nTodo **listo**', true)), ['say', 'response.end']);
  assert.deepEqual(said, ['Hola, ya lo hice.', 'Mira:', 'Todo listo']);
  assert.equal(said.join(' ').includes('secreto'), false);

  const quiet = createTranslator();
  quiet('event', { event: { type: 'message.updated', properties: { info: { id: 'a1', role: 'assistant' } } } });
  const events = flat(quiet('event', { event: { type: 'message.part.updated', properties: {
    part: { id: 't9', sessionID: 's1', messageID: 'a1', type: 'text', text: 'Algo. Privado.', time: { start: 1 } } } } }));
  assert.deepEqual(events.map((e) => e.type), ['response.start'], 'sin la opcion no envia texto');
});
