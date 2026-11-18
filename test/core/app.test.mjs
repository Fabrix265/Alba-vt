import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.mjs';
import { createFakeAdapter } from '../../src/adapters/fake/index.mjs';

function config(scene = { layer: 'base', props: [] }) {
  return {
    rules: { rules: [] },
    scenes: { scenes: { idle: scene } },
    persona: { name: 'Alba', limits: { minStateDurationMs: 0, maxTransientsPerMinute: 6 } },
    bindings: { default: { parameters: { mouth: 'MouthOpen' } } },
    assets: {},
    commands: { commands: {} }
  };
}

test('updateConfig reaplica escenas y assets aunque el estado efectivo no cambie', () => {
  const adapter = createFakeAdapter();
  const app = createApp({ config: config(), adapter });
  adapter.clear();
  app.updateConfig(config({ layer: 'base', props: ['mug'] }));
  const states = adapter.getCalls().filter((call) => call.type === 'state');
  assert.equal(states.length, 1);
  assert.deepEqual(states[0].payload.scene.props, ['mug']);
});
function manualTimers() {
  const pending = [];
  return {
    setTimer: (fn) => { const timer = { fn }; pending.push(timer); return timer; },
    clearTimer: (timer) => { const i = pending.indexOf(timer); if (i >= 0) pending.splice(i, 1); },
    // Avanza una frase (o todas si se repite hasta vaciar).
    step() { pending.shift()?.fn(); },
    flush() { while (pending.length) pending.shift().fn(); }
  };
}

async function realConfig() {
  const { createConfigLoader } = await import('../../src/core/config-loader.mjs');
  const { projectRoot } = await import('../../src/environment.mjs');
  const path = await import('node:path');
  return createConfigLoader({ configDir: path.join(projectRoot, 'config') }).load({ initial: true });
}

test('el reflejo de opencode: pensar, leer, programar, responder hablando y reposo al terminar de hablar', async () => {
  const real = await realConfig();
  let now = 0;
  const timers = manualTimers();
  const adapter = createFakeAdapter();
  // random alto: sus frases propias no saltan y el test solo ve la respuesta.
  const app = createApp({ config: real, adapter, now: () => now, random: () => 0.999, timers });
  const send = async (event) => { now += 1000; app.tick(now); return (await app.handleEvent({ source: 'opencode', ...event })); };
  const scene = () => app.getState().effective;
  await send({ type: 'session.busy' }); assert.equal(scene(), 'thinking');
  await send({ type: 'tool.start', tool: 'read' }); assert.equal(scene(), 'reading');
  await send({ type: 'tool.start', tool: 'write' }); assert.equal(scene(), 'coding');
  await send({ type: 'tool.end', tool: 'write', ok: true }); assert.equal(scene(), 'coding', 'terminar una herramienta no celebra');
  await send({ type: 'reasoning' }); assert.equal(scene(), 'thinking');
  await send({ type: 'response.start' }); assert.equal(scene(), 'answering');
  assert.ok(adapter.getCalls().some((call) => call.type === 'mouth'), 'responder mueve la boca');
  await send({ type: 'say', text: 'Primera frase de la respuesta.' });
  await send({ type: 'say', text: 'Segunda frase.' });
  const idle = await send({ type: 'session.idle' });
  assert.equal(idle.deferred, true);
  assert.equal(scene(), 'answering', 'no corta: sigue hablando aunque opencode ya termino');
  timers.step();
  assert.equal(scene(), 'answering', 'todavia dice la segunda frase');
  timers.flush();
  assert.equal(scene(), 'idle', 'al terminar de hablar vuelve a reposo, sin celebrar');
  const said = adapter.getCalls().filter((call) => call.type === 'speak').map((call) => call.payload.text);
  assert.deepEqual(said, ['Primera frase de la respuesta.', 'Segunda frase.']);
  app.stop();
});

test('un mensaje nuevo descarta lo que quedaba por decir; las respuestas largas se cortan con aviso', async () => {
  const real = await realConfig();
  real.phrases.settings.responseMaxChars = 40;
  let now = 0;
  const timers = manualTimers();
  const adapter = createFakeAdapter();
  const app = createApp({ config: real, adapter, now: () => now, random: () => 0.999, timers });
  const said = () => adapter.getCalls().filter((call) => call.type === 'speak').map((call) => call.payload.text);
  await app.handleEvent({ type: 'session.busy' });
  await app.handleEvent({ type: 'say', text: 'Uno dos tres cuatro cinco.' });
  await app.handleEvent({ type: 'say', text: 'Esta ya no entra en el limite.' });
  await app.handleEvent({ type: 'say', text: 'Ni esta.' });
  timers.flush();
  assert.equal(said().length, 2);
  assert.equal(said()[0], 'Uno dos tres cuatro cinco.');
  assert.ok(real.phrases.phrases.long_response.lines.includes(said()[1]), 'avisa que el resto esta en opencode');
  adapter.clear();
  await app.handleEvent({ type: 'session.busy' });
  await app.handleEvent({ type: 'say', text: 'Nuevo turno A.' });
  await app.handleEvent({ type: 'say', text: 'Nuevo turno B.' });
  await app.handleEvent({ type: 'session.busy' });
  timers.flush();
  assert.deepEqual(said(), ['Nuevo turno A.'], 'lo pendiente del turno anterior se descarta');
  app.stop();
});

test('Alba dice una frase propia al cambiar de escena y no mientras lee la respuesta', async () => {
  let now = 0;
  const timers = manualTimers();
  const adapter = createFakeAdapter();
  const base = config();
  base.scenes.scenes.coding = { layer: 'activity' };
  base.scenes.scenes.answering = { layer: 'activity', lipSync: true };
  base.rules = { rules: [
    { id: 'c', when: { type: 'tool.start' }, intent: 'coding' },
    { id: 'r', when: { type: 'response.start' }, intent: 'answering' }
  ] };
  base.phrases = { settings: { minGapMs: 0 }, phrases: { coding: { chance: 1, lines: ['¡Manos a la obra!'] }, answering: { chance: 1, lines: ['no deberia'] } } };
  const app = createApp({ config: base, adapter, now: () => now, random: () => 0, timers });
  adapter.clear();
  now += 1000;
  await app.handleEvent({ type: 'tool.start', tool: 'bash' });
  const spoken = () => adapter.getCalls().filter((call) => call.type === 'speak').map((call) => call.payload.text);
  assert.deepEqual(spoken(), ['¡Manos a la obra!']);
  now += 1000;
  await app.handleEvent({ type: 'response.start' });
  await app.handleEvent({ source: 'opencode', type: 'say', text: 'Respuesta del agente.' });
  timers.flush();
  assert.deepEqual(spoken(), ['¡Manos a la obra!', 'Respuesta del agente.']);
  app.stop();
});
