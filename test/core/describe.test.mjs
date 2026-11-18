import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEvent } from '../../src/core/describe.mjs';

test('describeEvent explica que regla disparo y que escena resulto', () => {
  const event = { source: 'opencode', type: 'tool.start', tool: 'bash' };
  assert.equal(describeEvent({ event, decision: { rule: 'herramienta-codigo', intent: 'coding' },
    applied: { applied: true, state: { effective: 'coding' } } }), 'opencode tool.start (bash) -> regla herramienta-codigo -> escena coding');
  assert.equal(describeEvent({ event: { ...event, tool: 'webfetch' }, decision: null }), 'opencode tool.start (webfetch) -> sin regla (no cambia nada)');
  assert.equal(describeEvent({ event, ignored: true, reason: 'asleep' }), 'opencode tool.start (bash) -> ignorado: Alba duerme');
  assert.match(describeEvent({ event, decision: { rule: 'x', intent: 'celebrate' },
    applied: { applied: false, reason: 'transient-limit', state: { effective: 'coding' } } }), /celebrate: descartado/);
});
