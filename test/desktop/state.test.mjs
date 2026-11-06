import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyResize, intersects, isOnScreen, loadWindowState, parseSize, resolveBounds, saveWindowState
} from '../../desktop/state.mjs';

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

test('un estado guardado sin version se ignora (migracion de tamano)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alba-window-'));
  const file = path.join(dir, 'window.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ x: 10, y: 10, width: 420, height: 560 }), 'utf8');
    assert.equal(loadWindowState(file), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parseSize acepta anchoxalto y rechaza valores fuera de rango', () => {
  assert.deepEqual(parseSize('240x240'), { width: 240, height: 240 });
  assert.deepEqual(parseSize(' 320 X 480 '), { width: 320, height: 480 });
  for (const value of ['', '   ', 'abc', '240', '240x', 'x240', '99x240', '240x99', '5000x240', null, undefined, 240]) {
    assert.equal(parseSize(value), null, String(value));
  }
});

test('resolveBounds da prioridad al tamano pedido y conserva la posicion', () => {
  const displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];
  const saved = { x: 100, y: 120, width: 420, height: 560 };
  assert.deepEqual(resolveBounds({ size: { width: 200, height: 200 }, saved, displays }), { x: 100, y: 120, width: 200, height: 200 });
  assert.deepEqual(resolveBounds({ saved, displays }), { x: 100, y: 120, width: 420, height: 560 });
  assert.deepEqual(resolveBounds({ displays }), { width: 420, height: 560 });
});

test('resolveBounds centra cuando no hay posicion utilizable', () => {
  const displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];
  const saved = { x: 4000, y: 4000, width: 300, height: 400 };
  assert.deepEqual(resolveBounds({ saved, displays }), { width: 300, height: 400 });
  assert.deepEqual(resolveBounds({ size: { width: 260, height: 260 }, saved, displays }), { width: 260, height: 260 });
});

test('applyResize mueve el borde correcto y respeta el minimo', () => {
  const bounds = { x: 100, y: 100, width: 400, height: 300 };
  assert.deepEqual(applyResize({ edge: 'e', bounds, dx: 50 }), { x: 100, y: 100, width: 450, height: 300 });
  assert.deepEqual(applyResize({ edge: 'w', bounds, dx: 50 }), { x: 150, y: 100, width: 350, height: 300 });
  assert.deepEqual(applyResize({ edge: 's', bounds, dy: -50 }), { x: 100, y: 100, width: 400, height: 250 });
  assert.deepEqual(applyResize({ edge: 'n', bounds, dy: -50 }), { x: 100, y: 50, width: 400, height: 350 });
  assert.deepEqual(applyResize({ edge: 'se', bounds, dx: 100, dy: 100 }), { x: 100, y: 100, width: 500, height: 400 });
  assert.deepEqual(applyResize({ edge: 'nw', bounds, dx: -100, dy: -100 }), { x: 0, y: 0, width: 500, height: 400 });
});

test('applyResize no baja del minimo ni pasa del maximo de la pantalla', () => {
  const bounds = { x: 100, y: 100, width: 400, height: 300 };
  assert.deepEqual(applyResize({ edge: 'e', bounds, dx: -1000, min: 120 }), { x: 100, y: 100, width: 120, height: 300 });
  assert.deepEqual(applyResize({ edge: 'w', bounds, dx: 1000, min: 120 }), { x: 380, y: 100, width: 120, height: 300 });
  assert.deepEqual(
    applyResize({ edge: 's', bounds, dy: 1000, max: { width: 1920, height: 500 } }),
    { x: 100, y: 100, width: 400, height: 500 }
  );
});

test('la ventana solo se restaura si intersecta una pantalla', () => {
  const displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];
  assert.equal(isOnScreen({ x: -200, y: 100, width: 420, height: 560 }, displays), true);
  assert.equal(isOnScreen({ x: 3000, y: 100, width: 420, height: 560 }, displays), false);
  assert.equal(intersects({ x: 0, y: 0, width: 10, height: 10 }, displays[0].workArea), true);
});