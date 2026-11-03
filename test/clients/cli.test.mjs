import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfigLoader } from '../../src/core/config-loader.mjs';
import { projectRoot } from '../../src/environment.mjs';
import { createFakeAdapter } from '../../src/adapters/fake/index.mjs';
import { createApp } from '../../src/app.mjs';
import { createBridgeServer } from '../../src/api/server.mjs';
import { createBridgeClient } from '../../clients/http/client.mjs';
import { runCli } from '../../clients/cli/alba.mjs';
import { createVtsProcess } from '../../src/platform/vts-process.mjs';
import path from 'node:path';

async function setup(t, processControl) {
  const config = createConfigLoader({ configDir: path.join(projectRoot, 'config') }).load({ initial: true });
  const adapter = createFakeAdapter();
  const app = createApp({ config, adapter, processControl });
  const server = createBridgeServer({ port: 0, token: 'test-token', getState: app.getState,
    subscribe: app.onChange, onIntent: app.handleIntent, onEvent: app.handleEvent });
  const { port } = await server.start();
  t.after(async () => { app.stop(); await server.stop(); });
  const client = createBridgeClient({ env: { ALBA_BRIDGE_PORT: port, ALBA_TOKEN: 'test-token' } });
  const output = [];
  const options = { client, write: (line) => output.push(line), confirm: async () => false };
  return { app, adapter, config, client, output, options };
}

test('CLI lista, duerme, ignora eventos/say y despierta por HTTP', async (t) => {
  const { options, app, adapter, output } = await setup(t);
  assert.equal(await runCli(['list'], options), 0);
  assert.ok(output.some((line) => line.startsWith('good night')));
  await runCli(['good', 'night'], options);
  assert.equal(app.getState().asleep, true);
  adapter.clear();
  assert.equal((await app.handleEvent({ type: 'say', text: 'hola' })).ignored, true);
  assert.equal(adapter.getCalls().length, 0);
  await runCli(['ring', 'ring'], options);
  assert.equal(app.getState().effective, 'idle');
  assert.equal(app.getState().asleep, false);
});

test('confirmacion no se puede omitir por CLI ni HTTP, incluso con config sin confirm', async (t) => {
  let closes = 0;
  const { app, options, client, config } = await setup(t, {
    status: { canClose: true, canLaunch: false }, close: async () => { closes++; }
  });
  config.commands.commands['lights out'].confirm = false;
  app.updateConfig(config);
  assert.equal(await runCli(['lights', 'out'], options), 1);
  await assert.rejects(client.intent({ intent: 'deep_sleep' }), { statusCode: 409 });
  assert.equal(closes, 0);
  await runCli(['lights', 'out', '--yes'], options);
  assert.equal(closes, 1);
  assert.equal(app.getState().deepSleep, true);
  await runCli(['ring', 'ring'], options);
  assert.equal(app.getState().asleep, false);
});

test('sin control de procesos deep_sleep degrada a pausa y explica el resultado', async (t) => {
  const { app, options, output } = await setup(t);
  await runCli(['lights', 'out', '--yes'], options);
  assert.equal(app.getState().deepSleep, false);
  assert.equal(app.getState().asleep, true);
  assert.ok(output.some((line) => line.includes('VTS sigue abierto')));
});

test('comandos se resuelven contra la config vigente y errores no se tragan', async (t) => {
  const { app, options, config } = await setup(t);
  config.commands.commands['a dormir'] = { intent: 'sleep' };
  app.updateConfig(config);
  await runCli(['a', 'dormir'], options);
  assert.equal(app.getState().asleep, true);
  await assert.rejects(runCli(['desconocido'], options), /Comando desconocido/);
});

test('proceso opt-in sin shell exige confirmacion para cerrar y lanzar', async () => {
  const calls = [];
  const processControl = createVtsProcess({ env: { VTS_PROCESS_CONTROL: 'true',
    VTS_CLOSE_COMMAND: '["close-vts","--graceful"]', VTS_LAUNCH_COMMAND: '["launch-vts"]' },
    run: async (...args) => calls.push(args) });
  await assert.rejects(processControl.close(), /Confirmacion/);
  await processControl.close({ confirmed: true });
  await processControl.launch({ confirmed: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].shell, false);
  assert.equal(calls[0][2].windowsHide, true);
  assert.deepEqual(createVtsProcess({ env: {} }).status, { canClose: false, canLaunch: false });
});

test('wake desde deep_sleep exige permiso para lanzar; reglas no cierran VTS', async (t) => {
  let launches = 0;
  const { app, options, config } = await setup(t, {
    status: { canClose: true, canLaunch: true }, close: async () => {}, launch: async () => { launches++; }
  });
  config.rules = { rules: [{ id: 'unsafe', when: { type: 'custom' }, intent: 'deep_sleep', args: { confirmed: true } }] };
  app.updateConfig(config);
  assert.equal((await app.handleEvent({ type: 'custom' })).reason, 'confirmation-required');
  await runCli(['good', 'night'], options);
  await runCli(['lights', 'out', '--yes'], options);
  assert.equal(app.getState().deepSleep, true);
  assert.equal(await runCli(['ring', 'ring'], options), 1);
  assert.equal(launches, 0);
  await runCli(['ring', 'ring', '--yes'], options);
  assert.equal(launches, 1);
});
