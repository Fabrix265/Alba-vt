import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirector } from '../../src/core/director.mjs';

const scenes = {
  scenes: {
    idle: { layer: 'base' },
    thinking: { layer: 'activity' },
    coding: { layer: 'activity', props: ['keyboard'] },
    reading: { layer: 'activity' },
    celebrate: { layer: 'transient', durationMs: 1000 },
    sleep: { layer: 'base' },
    deep_sleep: { layer: 'base' }
  }
};

function makeDirector(limits = { minStateDurationMs: 0, maxTransientsPerMinute: 2 }) {
  return createDirector({ scenes, persona: { limits } });
}

test('arranca en idle', () => {
  const director = makeDirector();
  const state = director.getState();
  assert.equal(state.base, 'idle');
  assert.equal(state.effective, 'idle');
  assert.deepEqual(state.props, []);
  assert.equal(state.asleep, false);
});

test('la actividad aporta sus props aditivas', () => {
  const director = makeDirector();
  const result = director.applyIntent('coding', { now: 1000 });
  assert.equal(result.applied, true);
  assert.equal(result.state.effective, 'coding');
  assert.deepEqual(result.state.props, ['keyboard']);
});

test('un transiente gana y al expirar vuelve a la actividad', () => {
  const director = makeDirector();
  director.applyIntent('coding', { now: 1000 });
  director.applyIntent('celebrate', { now: 2000 });
  assert.equal(director.getState().effective, 'celebrate');
  assert.deepEqual(director.getState().props, ['keyboard']);
  assert.equal(director.tick(2999).effective, 'celebrate');
  assert.equal(director.tick(3000).effective, 'coding');
});

test('respeta el limite global de transientes por minuto', () => {
  const director = makeDirector();
  assert.equal(director.applyIntent('celebrate', { now: 0 }).applied, true);
  assert.equal(director.applyIntent('celebrate', { now: 100 }).applied, true);
  const third = director.applyIntent('celebrate', { now: 200 });
  assert.equal(third.applied, false);
  assert.equal(third.reason, 'transient-limit');
});

test('respeta la duracion minima de estado', () => {
  const director = makeDirector({ minStateDurationMs: 1000, maxTransientsPerMinute: 6 });
  assert.equal(director.applyIntent('coding', { now: 0 }).applied, true);
  const blocked = director.applyIntent('reading', { now: 500 });
  assert.equal(blocked.applied, false);
  assert.equal(blocked.reason, 'min-duration');
  assert.equal(director.applyIntent('reading', { now: 1000 }).applied, true);
  assert.equal(director.getState().effective, 'reading');
});

test('sleep ignora eventos y wake vuelve a idle', () => {
  const director = makeDirector();
  director.applyIntent('sleep', { now: 0 });
  assert.equal(director.getState().asleep, true);
  assert.equal(director.getState().effective, 'sleep');
  const ignored = director.applyIntent('coding', { now: 100 });
  assert.equal(ignored.applied, false);
  assert.equal(ignored.reason, 'asleep');
  director.applyIntent('wake', { now: 200 });
  const state = director.getState();
  assert.equal(state.asleep, false);
  assert.equal(state.effective, 'idle');
});

test('deep_sleep marca el nivel profundo', () => {
  const director = makeDirector();
  director.applyIntent('deep_sleep', { now: 0 });
  const state = director.getState();
  assert.equal(state.asleep, true);
  assert.equal(state.deepSleep, true);
  assert.equal(state.effective, 'deep_sleep');
});

test('los props manuales se suman a los de la escena y se pueden limpiar', () => {
  const director = makeDirector();
  director.applyIntent('idle', { now: 0, props: ['mug'] });
  assert.deepEqual(director.getState().props, ['mug']);
  director.applyIntent('coding', { now: 2000 });
  assert.deepEqual([...director.getState().props].sort(), ['keyboard', 'mug']);
  director.applyIntent('idle', { now: 4000, props: [] });
  assert.deepEqual(director.getState().props, []);
});

test('una intencion sin escena degrada a idle', () => {
  const director = makeDirector();
  const result = director.applyIntent('fly', { now: 0 });
  assert.equal(result.applied, true);
  assert.equal(result.state.effective, 'idle');
});

test('updateConfig cambia los limites en caliente', () => {
  const director = makeDirector();
  director.updateConfig({ persona: { limits: { minStateDurationMs: 0, maxTransientsPerMinute: 0 } } });
  const result = director.applyIntent('celebrate', { now: 0 });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'transient-limit');
});
