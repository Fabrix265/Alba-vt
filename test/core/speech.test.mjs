import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLipSync, createSpeech } from '../../src/core/speech.mjs';

test('genera lip-sync sintetico con duracion minima', () => {
  const result = buildLipSync({ text: 'hola' });
  assert.equal(result.durationMs, 600);
  assert.equal(result.synthetic, true);
  assert.ok(result.frames.length > 1);
  assert.equal(result.frames.at(-1).value, 0);
});

test('la duracion crece con el texto y tiene tope', () => {
  const short = buildLipSync({ text: 'hola' });
  const long = buildLipSync({ text: 'x'.repeat(500) });
  assert.ok(long.durationMs > short.durationMs);
  assert.equal(long.durationMs, 6000);
});

test('con audio deja de ser sintetico', () => {
  const result = buildLipSync({ text: 'hola', audio: 'voz.wav' });
  assert.equal(result.synthetic, false);
});

test('speak emite frames y termina en cero', async () => {
  const frames = [];
  let clock = 0;
  const speech = createSpeech({ now: () => clock, stepMs: 100, onFrame: (value) => frames.push(value) });
  const result = speech.speak({ text: 'hola' });
  assert.equal(result.durationMs, 600);
  assert.equal(result.frames.at(-1).value, 0);
  clock = result.durationMs;
  await new Promise((resolve) => setTimeout(resolve, 150));
  speech.stop();
  assert.ok(frames.length > 1);
  assert.equal(frames.at(-1), 0);
});
