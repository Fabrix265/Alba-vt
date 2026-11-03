import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeAdapter } from '../../src/adapters/fake/index.mjs';

test('el adapter fake declara capacidades y registra llamadas', async () => {
  const adapter = createFakeAdapter();
  assert.equal(adapter.name, 'fake');
  assert.equal(adapter.capabilities.items, true);
  assert.equal(adapter.capabilities.processControl, false);

  await adapter.connect();
  assert.equal(adapter.connected, true);

  adapter.applyState(
    { effective: 'coding', props: ['keyboard'], asleep: false, deepSleep: false },
    { scenes: { scenes: { coding: { layer: 'activity' } } } }
  );
  adapter.setMouth(0.5);
  adapter.speak({ text: 'hola' });

  const calls = adapter.getCalls();
  assert.deepEqual(
    calls.map((call) => call.type),
    ['connect', 'state', 'mouth', 'speak']
  );
  assert.equal(calls[1].payload.effective, 'coding');
  assert.equal(calls[1].payload.scene.layer, 'activity');

  await adapter.disconnect();
  assert.equal(adapter.connected, false);
});

test('clear vacia el registro', async () => {
  const adapter = createFakeAdapter();
  await adapter.connect();
  adapter.clear();
  assert.deepEqual(adapter.getCalls(), []);
});
