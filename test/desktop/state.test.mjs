import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { intersects, isOnScreen, loadWindowState, saveWindowState } from '../../desktop/state.mjs';

test('guarda y recupera la posicion de la ventana', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alba-window-'));
  const file = path.join(dir, 'nested', 'window.json');
  try {
    assert.equal(loadWindowState(file), null);
    saveWindowState(file, { x: 10.4, y: 20.6, width: 420, height: 560 });
    assert.deepEqual(loadWindowState(file), { x: 10, y: 21, width: 420, height: 560 });
    assert.equal(saveWindowState(file, null), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('la ventana solo se restaura si intersecta una pantalla', () => {
  const displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];
  assert.equal(isOnScreen({ x: -200, y: 100, width: 420, height: 560 }, displays), true);
  assert.equal(isOnScreen({ x: 3000, y: 100, width: 420, height: 560 }, displays), false);
  assert.equal(intersects({ x: 0, y: 0, width: 10, height: 10 }, displays[0].workArea), true);
});