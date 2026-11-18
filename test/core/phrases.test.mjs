import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createPhrasebook } from '../../src/core/phrases.mjs';
import { createConfigLoader } from '../../src/core/config-loader.mjs';
import { projectRoot } from '../../src/environment.mjs';

const always = () => 0;

test('las frases no se repiten hasta agotar la lista y respetan la pausa minima', () => {
  let now = 0;
  const lines = ['a', 'b', 'c', 'd'];
  const book = createPhrasebook({ config: { settings: { minGapMs: 1000, memory: 2 }, phrases: { coding: { chance: 1, lines } } }, random: Math.random, now: () => now });
  const round = [];
  for (let i = 0; i < 4; i += 1) { now += 1000; round.push(book.pick('coding')); }
  assert.deepEqual([...round].sort(), lines, 'una vuelta completa sin repetir');
  now += 1000;
  const next = book.pick('coding');
  assert.notEqual(next, round.at(-1), 'la ronda nueva no empieza con la ultima dicha');
  assert.equal(book.pick('coding'), null, 'sin pausa se queda callada');
  book.noteSpoken(now + 500);
  now += 1200;
  assert.equal(book.pick('coding'), null, 'lo que dijo opencode tambien cuenta para la pausa');
});

test('chance, ignoreGap y escenas sin frases', () => {
  let now = 0;
  const book = createPhrasebook({
    config: { settings: { minGapMs: 10000, chance: 0 }, phrases: {
      thinking: { lines: ['x'] },
      sad: { chance: 1, ignoreGap: true, lines: ['snif'] }
    } },
    random: always, now: () => now
  });
  assert.equal(book.pick('thinking'), null, 'chance 0 no habla');
  assert.equal(book.pick('sad'), 'snif');
  now += 10;
  assert.equal(book.pick('sad'), 'snif', 'ignoreGap habla aunque haya hablado hace poco');
  assert.equal(book.pick('coding'), null);
});

test('phrases.json real: muchas frases, todas distintas y cortas', () => {
  const config = createConfigLoader({ configDir: path.join(projectRoot, 'config') }).load({ initial: true });
  const groups = Object.entries(config.phrases.phrases);
  const all = groups.flatMap(([, group]) => group.lines);
  assert.ok(all.length >= 100, `hay ${all.length} frases`);
  assert.equal(new Set(all).size, all.length, 'ninguna frase repetida');
  for (const key of ['thinking', 'reading', 'coding', 'celebrate', 'error', 'angry', 'sad', 'sleep', 'wake']) {
    assert.ok(config.phrases.phrases[key]?.lines.length >= 8, key);
  }
});
