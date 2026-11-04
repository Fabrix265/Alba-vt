import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createPngtuberAdapter } from '../../src/adapters/pngtuber/index.mjs';
import { createPetLauncher } from '../../src/adapters/pngtuber/launcher.mjs';

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alba-pngtuber-'));
  fs.mkdirSync(path.join(rootDir, 'assets', 'pngtuber'), { recursive: true });
  for (const name of ['idle', 'idle_talk', 'coding']) {
    fs.writeFileSync(path.join(rootDir, 'assets', 'pngtuber', `${name}.webm`), 'webm');
  }
  const assets = {
    idle: { type: 'clip', file: 'assets/pngtuber/idle.webm', loop: true },
    idle_talk: { type: 'clip', file: 'assets/pngtuber/idle_talk.webm' },
    coding: { type: 'clip', file: 'assets/pngtuber/coding.webm', fit: 'cover' }
  };
  const scenes = {
    scenes: {
      idle: { layer: 'base', clip: 'idle', talkingClip: 'idle_talk' },
      coding: { layer: 'activity', clip: 'coding' },
      broken: { layer: 'activity', clip: 'does-not-exist' }
    }
  };
  return { rootDir, assets, scenes };
}

async function connectedAdapter(t, extra = {}) {
  const { rootDir, assets, scenes } = fixture();
  const warnings = [];
  const adapter = createPngtuberAdapter({
    rootDir,
    env: { ALBA_PET_PORT: '0', ALBA_PET_LAUNCH: 'false', ALBA_PET_TOKEN: 'pet-token' },
    logger: { warn: (key, message) => warnings.push({ key, message }) },
    launcher: { start() { return true; }, stop() {}, running: true },
    ...extra
  });
  assert.equal(await adapter.connect(), true);
  t.after(async () => { await adapter.disconnect(); fs.rmSync(rootDir, { recursive: true, force: true }); });
  const port = adapter.getStatus().port;
  const socket = new WebSocket(`ws://127.0.0.1:${port}?token=pet-token`);
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString('utf8'))));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  t.after(() => socket.close());
  const waitState = async (predicate) => {
    for (let i = 0; i < 100; i += 1) {
      const found = messages.find((message) => message.type === 'state' && predicate(message));
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('no llego el estado esperado');
  };
  return { adapter, assets, scenes, messages, waitState, warnings };
}

test('PNGTuber sirve clips por WebSocket, alterna al hablar y degrada si falta el archivo', async (t) => {
  const { adapter, assets, scenes, waitState, warnings } = await connectedAdapter(t);
  const state = { effective: 'idle', asleep: false, deepSleep: false };
  adapter.applyState(state, { scenes, assets });
  const idle = await waitState((message) => message.scene === 'idle');
  assert.equal(idle.clip.id, 'idle');
  assert.equal(idle.clip.kind, 'video');
  assert.equal(idle.talking, false);
  assert.equal(adapter.capabilities.has('clips'), true);
  assert.equal(adapter.capabilities.has('hotkeys'), false);

  adapter.setMouth(0.8);
  const talking = await waitState((message) => message.talking === true);
  assert.equal(talking.clip.id, 'idle_talk');
  adapter.setMouth(0);
  await waitState((message) => message.talking === false);

  adapter.applyState({ ...state, effective: 'coding' }, { scenes, assets });
  const coding = await waitState((message) => message.scene === 'coding');
  assert.equal(coding.clip.id, 'coding');
  assert.equal(coding.clip.fit, 'cover');

  adapter.applyState({ ...state, effective: 'broken' }, { scenes, assets });
  const fallback = await waitState((message) => message.scene === 'broken');
  assert.equal(fallback.clip.id, 'idle');
  assert.equal(warnings.some(({ key }) => key === 'pngtuber-clip:does-not-exist'), true);
});

test('PNGTuber rechaza un token incorrecto y sobrevive a un puerto ocupado', async (t) => {
  const { adapter } = await connectedAdapter(t);
  const port = adapter.getStatus().port;
  const rejected = new WebSocket(`ws://127.0.0.1:${port}?token=nope`);
  const code = await new Promise((resolve) => rejected.once('close', resolve));
  assert.equal(code, 1008);

  const { rootDir } = fixture();
  const warnings = [];
  const blocked = createPngtuberAdapter({
    rootDir,
    env: { ALBA_PET_PORT: String(port), ALBA_PET_LAUNCH: 'false' },
    logger: { warn: (key, message) => warnings.push({ key, message }) },
    launcher: { start() { return true; }, stop() {}, running: false }
  });
  assert.equal(await blocked.connect(), false);
  assert.equal(blocked.connected, false);
  assert.equal(warnings.some(({ key }) => key === 'pngtuber-listen'), true);
  await blocked.disconnect();
  fs.rmSync(rootDir, { recursive: true, force: true });
});

test('el launcher respeta ALBA_PET_LAUNCH=false y no inicia procesos', () => {
  const launcher = createPetLauncher({ rootDir: '.', env: { ALBA_PET_LAUNCH: 'false' } });
  assert.equal(launcher.start(), false);
  assert.equal(launcher.running, false);
});
