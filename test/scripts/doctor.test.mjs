import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../../src/environment.mjs';
import { runDoctor, formatDoctor } from '../../scripts/doctor.mjs';
import { createMockVts } from '../fixtures/vts-server.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(projectRoot, '.doctor-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.cp(path.join(projectRoot, 'config'), path.join(dir, 'config'), { recursive: true });
  await fs.copyFile(path.join(projectRoot, '.env.example'), path.join(dir, '.env.example'));
  await fs.writeFile(path.join(dir, '.env'), 'ALBA_TOKEN=doctor-fixture\nVTS_AUTH_TOKEN=doctor-auth\n');
  return dir;
}

test('doctor diagnostica VTS sin ejecutar escenas y distingue avisos opcionales', async (t) => {
  const rootDir = await fixture(t);
  const mock = await createMockVts(({ messageType }) => {
    switch (messageType) {
      case 'APIStateRequest': return { active: true };
      case 'AuthenticationRequest': return { authenticated: true };
      case 'CurrentModelRequest': return { modelLoaded: true, modelName: 'Example', modelID: 'example-id' };
      case 'HotkeysInCurrentModelRequest': return { availableHotkeys: [{ name: 'Hello', hotkeyID: 'hello-id', type: 'TriggerAnimation' }] };
      case 'InputParameterListRequest': return { defaultParameters: [{ name: 'MouthOpen', min: 0, max: 1 }] };
      case 'PermissionRequest': return { permissions: [{ name: 'LoadCustomImagesAsItems', granted: false }] };
      default: throw new Error('unexpected request');
    }
  });
  t.after(() => mock.close());
  const report = await runDoctor({ rootDir, env: { VTS_PORT: String(mock.port) } });
  assert.equal(report.ok, true);
  assert.equal(report.inventory.model.name, 'Example');
  assert.equal(report.inventory.hotkeys[0].id, 'hello-id');
  assert.ok(report.checks.some((c) => c.name === 'Recursos' && c.status === 'warning'));
  const output = formatDoctor(report);
  assert.match(output, /MouthOpen/);
  assert.match(output, /keyboard/);
  assert.ok(!output.includes('doctor-auth'));
  assert.ok(!output.includes('doctor-fixture'));
  assert.ok(mock.requests.every((r) => !/Trigger|Inject|ItemLoad/.test(r.messageType)));
});

test('doctor falla con VTS cerrado e indica como habilitarlo', async (t) => {
  const rootDir = await fixture(t);
  const mock = await createMockVts();
  const port = mock.port;
  await mock.close();
  const report = await runDoctor({ rootDir, env: { VTS_PORT: String(port) }, connectTimeoutMs: 100 });
  assert.equal(report.ok, false);
  assert.match(formatDoctor(report), /Allow Plugin API access/);
});

test('doctor informa modelo ausente, Node antiguo y bridge sin token', async (t) => {
  const rootDir = await fixture(t);
  const mock = await createMockVts(({ messageType }) => {
    if (messageType === 'APIStateRequest') return { active: true };
    if (messageType === 'AuthenticationRequest') return { authenticated: true };
    return {};
  });
  t.after(() => mock.close());
  const report = await runDoctor({ rootDir, nodeVersion: '22.0.0', env: { VTS_PORT: String(mock.port), ALBA_TOKEN: '' } });
  assert.equal(report.ok, false);
  for (const name of ['Node', 'Bridge', 'Modelo']) assert.ok(report.checks.some((c) => c.name === name && c.status === 'error'));
});

test('doctor limita la espera de autorizacion y no expone respuestas con secretos', async (t) => {
  const rootDir = await fixture(t);
  const mock = await createMockVts(({ messageType }, respond) => {
    if (messageType === 'APIStateRequest') return { active: true };
    respond({ errorID: 50, message: 'secret-response' }, 'APIError');
  });
  t.after(() => mock.close());
  const report = await runDoctor({ rootDir, env: { VTS_PORT: String(mock.port) }, authTimeoutMs: 30, requestTimeoutMs: 30 });
  assert.equal(report.ok, false);
  assert.ok(!JSON.stringify(report).includes('secret-response'));
  assert.match(formatDoctor(report), /Autoriza Alba/);
});
test('doctor reconoce el modo fake sin tocar VTS', async (t) => {
  const rootDir = await fixture(t);
  const report = await runDoctor({ rootDir, env: { ALBA_ADAPTER: 'fake' }, connectTimeoutMs: 50 });
  assert.equal(report.ok, true);
  assert.equal(report.inventory.adapter, 'fake');
  assert.ok(report.checks.some((c) => c.name === 'Adapter' && c.status === 'ok'));
  assert.ok(report.checks.some((c) => c.name === 'Modo' && c.status === 'ok'));
  assert.ok(!report.checks.some((c) => c.name === 'VTS'));
  assert.ok(report.checks.some((c) => c.name === 'Recursos' && c.status === 'warning'));
});

test('doctor valida el tamano de ventana pedido para pngtuber', async (t) => {
  const rootDir = await fixture(t);
  const good = await runDoctor({ rootDir, env: { ALBA_ADAPTER: 'pet', ALBA_PET_WINDOW: '240x240' }, connectTimeoutMs: 50 });
  assert.ok(good.checks.some((c) => c.name === 'Tamano PNGTuber' && c.status === 'ok'));
  const bad = await runDoctor({ rootDir, env: { ALBA_ADAPTER: 'pet', ALBA_PET_WINDOW: 'grande' }, connectTimeoutMs: 50 });
  assert.ok(bad.checks.some((c) => c.name === 'Tamano PNGTuber' && c.status === 'warning'));
  assert.match(formatDoctor(bad), /240x240/);
});

test('doctor revisa puerto, token, ventana y clips del modo pngtuber', async (t) => {
  const rootDir = await fixture(t);
  const report = await runDoctor({ rootDir, env: { ALBA_ADAPTER: 'pet', ALBA_PET_PORT: '0' }, connectTimeoutMs: 50 });
  assert.equal(report.ok, false);
  assert.equal(report.inventory.adapter, 'pngtuber');
  for (const name of ['Adapter', 'Puerto PNGTuber', 'Token PNGTuber', 'Ventana PNGTuber', 'Clips PNGTuber']) {
    assert.ok(report.checks.some((c) => c.name === name), name);
  }
  assert.ok(report.checks.some((c) => c.name === 'Puerto PNGTuber' && c.status === 'error'));
  assert.ok(!report.checks.some((c) => c.name === 'VTS'));
  assert.equal(report.inventory.assets.find((asset) => asset.id === 'keyboard').supported, false);
  assert.match(formatDoctor(report), /no aplica al adapter/);
});
