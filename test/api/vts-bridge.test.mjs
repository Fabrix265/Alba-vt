import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createMockVts, waitFor } from '../fixtures/vts-server.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const headers = { 'Content-Type': 'application/json', 'X-Alba-Token': 'bridge-fixture-token' };

async function startBridge(t, port, adapter = 'vts') {
  const child = spawn(process.execPath, ['src/index.mjs'], {
    cwd: root, windowsHide: true,
    env: { ...process.env, ALBA_ADAPTER: adapter, VTS_PORT: String(port), ALBA_BRIDGE_PORT: '0',
      ALBA_TOKEN: 'bridge-fixture-token', VTS_AUTH_TOKEN: 'vts-fixture-token', VTS_REQUEST_ITEM_PERMISSION: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, 'close');
    child.kill();
    await closed;
  });
  await waitFor(() => {
    if (child.exitCode !== null) throw new Error(output);
    return /bridge escuchando en http:\/\/127\.0\.0\.1:\d+/.test(output);
  }, 5000);
  const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  return {
    child, url,
    async post(route, body) {
      const response = await fetch(url + route, { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal(response.status, 200);
      return response.json();
    }
  };
}

test('bridge con adapter VTS ignora say dormido y sigue respondiendo tras desconexion', async (t) => {
  const mock = await createMockVts(({ messageType }) => {
    if (messageType === 'AuthenticationRequest') return { authenticated: true };
    if (messageType === 'CurrentModelRequest') return { modelLoaded: true, modelID: 'fixture', modelName: 'Fixture' };
    if (messageType === 'InputParameterListRequest') return { defaultParameters: [{ name: 'MouthOpen', min: 0, max: 1 }] };
    return {};
  });
  t.after(() => mock.close());
  const bridge = await startBridge(t, mock.port);
  await waitFor(() => mock.requests.some((r) => r.messageType === 'InputParameterListRequest'));
  await bridge.post('/event', { source: 'test', type: 'say', text: 'hola Alba' });
  await waitFor(() => mock.requests.some((r) => r.messageType === 'InjectParameterDataRequest'));
  const sleep = await bridge.post('/intent', { intent: 'sleep' });
  assert.equal(sleep.state.asleep, true);
  const say = await bridge.post('/event', { source: 'test', type: 'say', text: 'ignorado' });
  assert.equal(say.ignored, true);
  assert.equal(say.reason, 'asleep');
  mock.dropConnections();
  const wake = await bridge.post('/intent', { intent: 'wake' });
  assert.equal(wake.state.effective, 'idle');
  const response = await fetch(bridge.url + '/state', { headers });
  assert.equal(response.status, 200);
  assert.equal(bridge.child.exitCode, null);
});

test('HTTP arranca aunque la autenticacion VTS este pendiente', async (t) => {
  const mock = await createMockVts(() => undefined);
  t.after(() => mock.close());
  const bridge = await startBridge(t, mock.port);
  const response = await fetch(bridge.url + '/state', { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state.effective, 'idle');
});

test('ALBA_ADAPTER=fake mantiene el bridge disponible sin conexiones VTS', async (t) => {
  const mock = await createMockVts();
  t.after(() => mock.close());
  const bridge = await startBridge(t, mock.port, 'fake');
  const response = await bridge.post('/intent', { intent: 'coding' });
  assert.equal(response.state.effective, 'coding');
  assert.deepEqual(response.state.props, ['keyboard']);
  assert.equal(mock.requests.length, 0);
});