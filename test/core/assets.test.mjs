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

test('resuelve clips y los omite sin avisar cuando el adapter no los soporta', () => {
  const rootDir = tempRoot();
  fs.mkdirSync(path.join(rootDir, 'assets', 'pngtuber'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'assets', 'pngtuber', 'idle.apng'), 'apng');
  const clipAssets = {
    ...assets,
    idle: { type: 'clip', file: 'assets/pngtuber/idle.apng', loop: true, fit: 'contain' },
    missing: { type: 'clip', file: 'assets/pngtuber/missing.webm' }
  };
  try {
    const vtuber = createAssetRegistry({ assets: clipAssets, rootDir, assetTypes: ['item'] });
    assert.equal(vtuber.resolve('idle'), null);
    assert.deepEqual(vtuber.missing().sort(), ['chime', 'mug']);
    const pngtuber = createAssetRegistry({ assets: clipAssets, rootDir, assetTypes: ['clip'] });
    const idle = pngtuber.resolve('idle');
    assert.equal(idle.type, 'clip');
    assert.equal(idle.loop, true);
    assert.equal(idle.fit, 'contain');
    assert.equal(pngtuber.resolve('missing'), null);
    assert.deepEqual(pngtuber.missing().sort(), ['chime', 'missing']);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});