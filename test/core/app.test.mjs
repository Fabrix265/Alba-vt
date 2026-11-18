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