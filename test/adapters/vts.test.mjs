import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVtsAdapter, reconnectDelay } from '../../src/adapters/vts/index.mjs';
import { selectBinding, translateScene } from '../../src/adapters/vts/translate.mjs';
import { createMockVts, waitFor } from '../fixtures/vts-server.mjs';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const state = (effective = 'idle', props = []) => ({ effective, props, asleep: effective === 'sleep' });
const context = {
  bindings: {
    default: { hotkeys: { coding: 'Code' }, parameters: { mouth: 'CustomMouth', angleX: 'CustomAngle' } },
    models: { other: { match: ['Second'], parameters: { mouth: 'OtherMouth' } } }
  },
  scenes: { scenes: {
    idle: { parameters: { angleX: 0 } },
    coding: { parameters: { angleX: 99 } },
    thinking: { parameters: { angleX: -5 } },
    sleep: {}
  } },
  assets: {}
};

async function setup(t, options = {}) {
  const runtime = {
    model: { modelLoaded: true, modelID: 'first-id', modelName: 'First' },
    hotkeys: [{ name: 'Code', hotkeyID: 'code-id', type: 'TriggerAnimation' }],
    parameters: [
      { name: 'CustomMouth', min: 0, max: 1 },
      { name: 'OtherMouth', min: 0, max: 1 },
      { name: 'CustomAngle', min: -30, max: 30 }
    ],
    permitted: true,
    ...options.runtime
  };
  let instance = 0;
  const handler = (request, respond, socket) => {
    if (options.handle?.(request, respond, socket) === true) return;
    switch (request.messageType) {
      case 'AuthenticationRequest': return { authenticated: true };
      case 'CurrentModelRequest': return runtime.model;
      case 'HotkeysInCurrentModelRequest': return { ...runtime.model, availableHotkeys: runtime.hotkeys };
      case 'InputParameterListRequest': return { ...runtime.model, defaultParameters: runtime.parameters, customParameters: [] };
      case 'PermissionRequest': return { permissions: [{ name: 'LoadCustomImagesAsItems', granted: runtime.permitted }] };
      case 'ItemLoadRequest': return { instanceID: `instance-${++instance}` };
      default: return {};
    }
  };
  const mock = await createMockVts(handler);
  const warnings = [];
  const adapter = createVtsAdapter({
    rootDir, port: mock.port, token: 'fixture-token',
    logger: { log() {}, warn(message) { warnings.push(message); } },
    refreshIntervalMs: 10000, injectionIntervalMs: 20, reconnectBaseMs: 40, reconnectMaxMs: 80,
    ...options.adapter
  });
  t.after(async () => { await adapter.disconnect(); await mock.close(); });
  await adapter.applyState(state(), context);
  assert.equal(await adapter.connect(), true);
  return { adapter, mock, runtime, warnings, handler };
}

const requests = (mock, type) => mock.requests.filter((request) => request.messageType === type);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('bindings por ID prevalecen sobre nombre; respaldo usa solo parametros reportados y limita valores', () => {
  const bindings = {
    default: { parameters: { mouth: 'generic' } },
    models: { Second: { parameters: { mouth: 'by-name' } }, id: { parameters: { mouth: 'by-id' } } }
  };
  assert.equal(selectBinding(bindings, { modelID: 'id', modelName: 'Second' }).parameters.mouth, 'by-id');
  const plan = translateScene('coding', context, {
    model: { modelLoaded: true }, hotkeys: [], parameters: [{ name: 'CustomAngle', min: -30, max: 30 }]
  });
  assert.equal(plan.hotkey, null);
  assert.deepEqual(plan.parameters, [{ id: 'CustomAngle', value: 30 }]);
  assert.equal(reconnectDelay(0, 100, 1000), 100);
  assert.equal(reconnectDelay(3, 100, 1000), 800);
  assert.equal(reconnectDelay(30, 100, 1000), 1000);
});

test('descubre capacidades, evita repetir hotkeys y usa boca por modelo con recarga de bindings', async (t) => {
  const { adapter, mock, runtime } = await setup(t);
  assert.equal(adapter.capabilities.items, true);
  assert.equal(adapter.capabilities.processControl, false);
  await adapter.applyState(state('coding'), context);
  await adapter.applyState(state('coding'), context);
  await adapter.refresh();
  assert.equal(requests(mock, 'HotkeyTriggerRequest').length, 1);
  adapter.setMouth(2);
  await waitFor(() => requests(mock, 'InjectParameterDataRequest').some((r) => r.data.parameterValues.some((p) => p.id === 'CustomMouth' && p.value === 1)));
  runtime.model = { modelLoaded: true, modelID: 'second-id', modelName: 'Second' };
  runtime.hotkeys = [];
  await adapter.refresh();
  adapter.setMouth(0.5);
  await waitFor(() => requests(mock, 'InjectParameterDataRequest').some((r) => r.data.parameterValues.some((p) => p.id === 'OtherMouth' && p.value === 0.5)));
  const next = structuredClone(context);
  next.scenes.scenes.thinking.parameters.angleX = 12;
  await adapter.applyState(state('thinking'), next);
  await waitFor(() => requests(mock, 'InjectParameterDataRequest').some((r) => r.data.parameterValues.some((p) => p.id === 'CustomAngle' && p.value === 12)));
  assert.equal(adapter.getStatus().model.modelName, 'Second');
  assert.ok(!JSON.stringify(adapter.getStatus()).includes('fixture-token'));
});

test('hotkey fallido degrada a parametros sostenidos; sleep detiene frames y wake los recupera', async (t) => {
  const { adapter, mock, warnings } = await setup(t, {
    handle(request, respond) {
      if (request.messageType === 'HotkeyTriggerRequest') { respond({ errorID: 100 }, 'APIError'); return true; }
    }
  });
  await adapter.applyState(state('coding'), context);
  await waitFor(() => requests(mock, 'InjectParameterDataRequest').filter((r) => r.data.parameterValues.some((p) => p.value === 30)).length >= 3);
  assert.equal(warnings.filter((m) => m.includes('ejecutar el hotkey')).length, 1);
  await adapter.applyState(state('sleep'), context);
  await pause(30);
  const count = requests(mock, 'InjectParameterDataRequest').length;
  adapter.setMouth(0.7);
  await pause(60);
  assert.equal(requests(mock, 'InjectParameterDataRequest').length, count);
  await adapter.applyState(state(), context);
  await waitFor(() => requests(mock, 'InjectParameterDataRequest').length > count);
});

test('sin modelo ni permiso no envia hotkeys, parametros ni props; avisa una vez por causa', async (t) => {
  const { adapter, mock, warnings } = await setup(t, {
    runtime: { model: { modelLoaded: false }, hotkeys: [], permitted: false }
  });
  for (let i = 0; i < 3; i += 1) {
    await adapter.applyState(state('coding', ['keyboard']), context);
    adapter.setMouth(1);
  }
  assert.equal(adapter.capabilities.modelDetection, true);
  assert.equal(adapter.capabilities.parameters, false);
  assert.equal(requests(mock, 'HotkeyTriggerRequest').length, 0);
  assert.equal(requests(mock, 'InjectParameterDataRequest').length, 0);
  assert.equal(requests(mock, 'ItemLoadRequest').length, 0);
  assert.equal(warnings.filter((m) => m.includes('props omitidos')).length, 1);
});

async function assetFixture(t) {
  const dir = await fs.mkdtemp(path.join(rootDir, '.vts-items-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'prop.png'), Buffer.from('test image payload'));
  const next = structuredClone(context);
  next.assets.keyboard = { type: 'item', file: path.relative(rootDir, path.join(dir, 'prop.png')), position: { x: 0.2, y: -0.3 }, size: 0.4 };
  return next;
}

test('props via base64, sin duplicados, con retirada por instancia y recuperacion de permisos', async (t) => {
  const next = await assetFixture(t);
  const { adapter, mock, runtime } = await setup(t, { runtime: { permitted: false } });
  await adapter.applyState(state('coding', ['keyboard']), next);
  assert.equal(requests(mock, 'ItemLoadRequest').length, 0);
  runtime.permitted = true;
  await adapter.refresh();
  await adapter.applyState(state('coding', ['keyboard']), next);
  const loads = requests(mock, 'ItemLoadRequest');
  assert.equal(loads.length, 1);
  assert.equal(Buffer.from(loads[0].data.customDataBase64, 'base64').toString(), 'test image payload');
  assert.equal(loads[0].data.positionY, -0.3);
  assert.equal(loads[0].data.unloadWhenPluginDisconnects, true);
  assert.match(loads[0].data.fileName, /^alba-[a-f0-9]{20}\.png$/);
  await adapter.applyState(state(), next);
  const unload = requests(mock, 'ItemUnloadRequest').at(-1).data;
  assert.deepEqual(unload.instanceIDs, ['instance-1']);
  assert.equal(unload.allowUnloadingItemsLoadedByUserOrOtherPlugins, false);
  assert.equal(unload.unloadAllInScene, false);
});

test('sleep durante carga tardia retira el prop que acaba de llegar', async (t) => {
  const next = await assetFixture(t);
  let finishLoad;
  const { adapter, mock } = await setup(t, {
    handle(request, respond) {
      if (request.messageType === 'ItemLoadRequest') { finishLoad = () => respond({ instanceID: 'late-item' }); return true; }
    }
  });
  const rendering = adapter.applyState(state('coding', ['keyboard']), next);
  await waitFor(() => Boolean(finishLoad));
  const sleeping = adapter.applyState(state('sleep'), next);
  finishLoad();
  await Promise.all([rendering, sleeping]);
  assert.deepEqual(requests(mock, 'ItemUnloadRequest').at(-1).data.instanceIDs, ['late-item']);
  assert.deepEqual(adapter.getStatus().props, []);
});

test('reconexion reautentica sin popup y aplica solo el ultimo estado', async (t) => {
  const { adapter, mock } = await setup(t);
  await adapter.applyState(state('coding'), context);
  mock.dropConnections();
  await waitFor(() => !adapter.connected);
  await adapter.applyState(state('thinking'), context);
  await adapter.applyState(state(), context);
  await waitFor(() => adapter.connected);
  assert.equal(requests(mock, 'AuthenticationRequest').length, 2);
  assert.equal(requests(mock, 'AuthenticationTokenRequest').length, 0);
  assert.equal(requests(mock, 'HotkeyTriggerRequest').length, 1);
  await adapter.disconnect();
  const count = mock.requests.length;
  await pause(120);
  assert.equal(mock.requests.length, count);
});

test('PNG ausentes, tipos futuros y archivos fuera del proyecto se omiten sin romper', async (t) => {
  const { adapter, mock, warnings } = await setup(t);
  const next = structuredClone(context);
  next.assets = {
    missing: { type: 'item', file: 'assets/props/does-not-exist.png' },
    future: { type: 'sound', file: 'assets/sound.wav' },
    invalid: { type: 'item', file: 'package.json' }
  };
  for (let i = 0; i < 2; i += 1) await adapter.applyState(state('coding', ['missing', 'future', 'invalid']), next);
  assert.equal(requests(mock, 'ItemLoadRequest').length, 0);
  assert.equal(warnings.filter((m) => m.includes('prop missing')).length, 1);
  assert.equal(adapter.connected, true);
});

test('VTS cerrado no rompe connect y se recupera cuando vuelve al mismo puerto', async (t) => {
  const probe = await createMockVts();
  const port = probe.port;
  await probe.close();
  const adapter = createVtsAdapter({
    rootDir, port, token: 'fixture-token', reconnectBaseMs: 20, reconnectMaxMs: 40,
    logger: { log() {}, warn() {} }
  });
  t.after(() => adapter.disconnect());
  assert.equal(await adapter.connect(), false);
  await adapter.applyState(state('sleep'), context);
  const mock = await createMockVts(({ messageType }) => {
    if (messageType === 'AuthenticationRequest') return { authenticated: true };
    if (messageType === 'CurrentModelRequest') return { modelLoaded: false };
    return {};
  }, { port });
  t.after(() => mock.close());
  await waitFor(() => adapter.connected);
  assert.equal(requests(mock, 'InjectParameterDataRequest').length, 0);
});