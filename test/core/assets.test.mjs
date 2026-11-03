import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAssetRegistry } from '../../src/core/assets.mjs';
import { createCapabilities } from '../../src/core/capabilities.mjs';

function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alba-assets-'));
  fs.mkdirSync(path.join(dir, 'assets', 'props'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'props', 'keyboard.png'), 'png');
  return dir;
}

const assets = {
  keyboard: { type: 'item', file: 'assets/props/keyboard.png', layer: 'props' },
  mug: { type: 'item', file: 'assets/props/mug.png', layer: 'props' },
  chime: { type: 'sound', file: 'assets/sounds/chime.wav' }
};

test('resuelve recursos presentes y detecta los ausentes', () => {
  const rootDir = tempRoot();
  try {
    const registry = createAssetRegistry({
      assets,
      rootDir,
      capabilities: createCapabilities({ items: true })
    });
    assert.equal(registry.resolve('keyboard').id, 'keyboard');
    assert.equal(registry.resolve('mug'), null);
    assert.equal(registry.resolve('chime'), null);
    assert.deepEqual(registry.missing().sort(), ['chime', 'mug']);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('si el adapter no soporta items no intenta cargar props', () => {
  const rootDir = tempRoot();
  try {
    const registry = createAssetRegistry({
      assets,
      rootDir,
      capabilities: createCapabilities({ items: false })
    });
    assert.equal(registry.resolve('keyboard'), null);
    assert.equal(registry.resolve('chime'), null);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('report devuelve disponibles y ausentes', () => {
  const rootDir = tempRoot();
  try {
    const registry = createAssetRegistry({
      assets,
      rootDir,
      capabilities: createCapabilities({ items: true })
    });
    const report = registry.report();
    assert.deepEqual(report.available, ['keyboard']);
    assert.deepEqual(report.missing.sort(), ['chime', 'mug']);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
