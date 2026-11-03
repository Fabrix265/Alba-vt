import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createConfigLoader } from '../src/core/config-loader.mjs';
import { createAssetRegistry } from '../src/core/assets.mjs';
import { createFakeAdapter } from '../src/adapters/fake/index.mjs';
import { createApp } from '../src/app.mjs';
import { createBridgeClient } from '../clients/http/client.mjs';
import { isMain, projectRoot } from '../src/environment.mjs';

export async function runDemo({ fake = false, write = console.log } = {}) {
  let app;
  let adapter;
  let clock = 0;
  let client;
  let pause = delay;
  let now = Date.now;
  if (fake) {
    const config = createConfigLoader({ configDir: path.join(projectRoot, 'config') }).load({ initial: true });
    createAssetRegistry({ assets: config.assets, rootDir: projectRoot }).report();
    adapter = createFakeAdapter();
    now = () => clock;
    app = createApp({ config, adapter, now });
    await adapter.connect();
    client = {
      state: async () => ({ state: app.getState() }),
      event: async (event) => ({ ...await app.handleEvent(event), state: app.getState() })
    };
    // Advance the same director/rules clock locally, without timers or connections.
    pause = async (ms) => { clock += ms; app.tick(); };
  } else client = createBridgeClient();

  const observed = [];
  const show = (state, expected) => {
    if (state.effective !== expected) {
      throw new Error(`Esperaba ${expected}, recibio ${state.effective}. Revisa las reglas, cooldowns y otros clientes activos.`);
    }
    observed.push(state.effective);
    write(`[demo] ${state.effective} | props solicitados: ${state.props.join(', ') || 'ninguno'}`);
  };
  const send = (event) => client.event({ source: 'demo', ...event });
  async function finishTransient(state) {
    if (state.transient) await pause(Math.max(0, state.transient.expiresAt - now()) + 300);
    return (await client.state()).state;
  }
  try {
    write(`[demo] ${fake ? 'fake: sin VTS ni conexiones' : 'bridge local: eventos HTTP, sin opencode'}`);
    const initial = (await client.state()).state;
    if (initial.asleep) throw new Error('Alba esta dormida. Despiertala antes de ejecutar la demo.');
    if (!fake && !initial.adapter.connected) write('[demo] VTS no esta conectado; se mostraran los estados del bridge.');
    // Respect configurable minimum duration between changes of activity.
    const holdMs = Math.max(800, (initial.limits?.minStateDurationMs ?? 0) + 100);
    show(await finishTransient((await send({ type: 'session.idle' })).state), 'idle');
    await pause(holdMs);
    show((await send({ type: 'session.start' })).state, 'thinking');
    await pause(holdMs);
    show((await send({ type: 'tool.start', tool: 'bash' })).state, 'coding');
    await pause(holdMs);
    show((await send({ type: 'tool.end', tool: 'bash', ok: true })).state, 'celebrate');
    // Clear the activity/props while the transient finishes, then return to base.
    const ended = (await send({ type: 'session.idle' })).state;
    show(await finishTransient(ended), 'idle');
    write(`[demo] completada: ${observed.join(' -> ')}`);
    return observed;
  } finally {
    app?.stop();
    await adapter?.disconnect();
  }
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run demo: envia eventos al bridge de npm start\nnpm run demo -- --fake: demo local, sin VTS ni conexiones');
  } else if (args.some((arg) => arg !== '--fake')) {
    console.error('Demo: opcion desconocida; usa --help');
    process.exitCode = 1;
  } else {
    try { await runDemo({ fake: args.includes('--fake') }); }
    catch (error) { console.error(`Demo: ${error.message}`); process.exitCode = 1; }
  }
}
