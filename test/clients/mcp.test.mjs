import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createBridgeServer } from '../../src/api/server.mjs';
import { projectRoot } from '../../src/environment.mjs';
import { PassThrough } from 'node:stream';
import { serve } from '../../clients/mcp/server.mjs';

async function start(t) {
  const events = [];
  const intents = [];
  const bridge = createBridgeServer({ port: 0, token: 'test-token', getState: () => ({ effective: 'idle' }),
    onEvent: (event) => { events.push(event); return { speech: { synthetic: true } }; },
    onIntent: (intent) => {
      if (intent.intent === 'deep_sleep' && !intent.confirmed) throw Object.assign(new Error('secret'), { statusCode: 409 });
      intents.push(intent);
    } });
  const { port } = await bridge.start();
  const child = spawn(process.execPath, ['clients/mcp/server.mjs'], { cwd: projectRoot, windowsHide: true,
    env: { ...process.env, ALBA_BRIDGE_PORT: String(port), ALBA_TOKEN: 'test-token' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  let stderr = '';
  child.stderr.on('data', (data) => stderr += data);
  const reader = createInterface({ input: child.stdout });
  const iterator = reader[Symbol.asyncIterator]();
  let id = 0;
  const send = (value) => child.stdin.write(JSON.stringify(value) + '\n');
  const next = async () => {
    const { value, done } = await iterator.next();
    assert.equal(done, false, stderr);
    lines.push(value);
    return JSON.parse(value);
  };
  const request = async (method, params) => { send({ jsonrpc: '2.0', id: ++id, method, params }); return next(); };
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const closed = once(child, 'close'); child.kill(); await closed; }
    reader.close(); await bridge.stop();
  });
  return { child, events, intents, send, next, request, bridge, lines, stderr: () => stderr };
}
const initialize = { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } };

test('stdio real: negociacion, catalogo y las seis tools mediante HTTP', { timeout: 10000 }, async (t) => {
  const p = await start(t);
  assert.equal((await p.request('tools/list')).error.code, -32002);
  assert.deepEqual((await p.request('ping')).result, {});
  const init = await p.request('initialize', initialize);
  assert.equal(init.result.protocolVersion, '2025-11-25');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  p.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const list = await p.request('tools/list');
  assert.equal(list.result.tools.length, 6);
  const call = (name, args = {}) => p.request('tools/call', { name, arguments: args });
  assert.equal((await call('avatar_status')).result.isError, false);
  const said = await call('avatar_say', { text: 'Hola\nAlba con ñ' });
  assert.equal(said.result.isError, false);
  assert.deepEqual(p.events[0], { source: 'mcp', type: 'say', text: 'Hola\nAlba con ñ' });
  await call('avatar_scene', { scene: 'coding', props: ['keyboard'] });
  await call('avatar_hotkey', { intent: 'celebrate' });
  await call('avatar_sleep');
  await call('avatar_wake');
  assert.deepEqual(p.intents.map((item) => item.intent), ['coding', 'celebrate', 'sleep', 'wake']);
  assert.equal((await call('avatar_sleep', { deep: true })).result.isError, true);
  assert.equal(p.intents.length, 4);
  await call('avatar_sleep', { deep: true, confirmed: true });
  assert.equal(p.intents.at(-1).intent, 'deep_sleep');
  assert.equal(p.stderr(), '');
  assert.ok(p.lines.every((line) => JSON.parse(line).jsonrpc === '2.0'));
});

test('stdio: errores, notifications sin respuesta, version negociada y EOF limpio', { timeout: 10000 }, async (t) => {
  const p = await start(t);
  p.child.stdin.write('{broken\n');
  assert.equal((await p.next()).error.code, -32700);
  const init = await p.request('initialize', { ...initialize, protocolVersion: 'unknown' });
  assert.equal(init.result.protocolVersion, '2025-11-25');
  p.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  p.send({ jsonrpc: '2.0', method: 'unknown-notification' });
  assert.equal((await p.request('unknown-method')).error.code, -32601);
  assert.equal((await p.request('tools/call', { name: 'avatar_say', arguments: { text: 10 } })).error.code, -32602);
  assert.equal((await p.request('tools/call', { name: 'avatar_scene', arguments: { scene: 'coding', secret: 'hidden' } })).error.code, -32602);
  assert.equal((await p.request('tools/call', { name: 'missing' })).error.code, -32602);
  await p.bridge.stop();
  const offline = await p.request('tools/call', { name: 'avatar_status' });
  assert.equal(offline.result.isError, true);
  assert.equal(JSON.stringify(offline).includes('test-token'), false);
  const closed = once(p.child, 'close');
  p.child.stdin.end();
  assert.equal((await closed)[0], 0);
});

test('stdio cierra ante una linea sin limite en vez de acumular memoria', { timeout: 10000 }, async (t) => {
  const p = await start(t);
  const closed = once(p.child, 'close');
  p.child.stdin.end('x'.repeat(65537));
  assert.equal((await closed)[0], 1);
});

test('tools/list oculta avatar_hotkey cuando el adapter no los soporta', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.on('data', (chunk) => lines.push(...chunk.toString('utf8').trim().split('\n').filter(Boolean)));
  const task = serve({
    input, output,
    client: { state: async () => ({ state: { adapter: { name: 'pngtuber', capabilities: { hotkeys: false } } } }) }
  });
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initialize }) + '\n');
  input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  input.end();
  await task;
  const list = JSON.parse(lines.at(-1));
  assert.equal(list.result.tools.length, 5);
  assert.equal(list.result.tools.some((tool) => tool.name === 'avatar_hotkey'), false);
});
