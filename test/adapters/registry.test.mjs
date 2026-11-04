import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter, isAdapterName, normalizeAdapterName } from '../../src/adapters/registry.mjs';

test('normaliza el modo vtuber y sus alias historicos', () => {
  assert.equal(normalizeAdapterName('vtuber'), 'vtuber');
  assert.equal(normalizeAdapterName('vts'), 'vtuber');
  assert.equal(normalizeAdapterName(' fake '), 'fake');
  assert.equal(isAdapterName('vtuber'), true);
  assert.equal(isAdapterName('nope'), false);
});

test('crea adapters conocidos y rechaza desconocidos', () => {
  const env = { VTS_PORT: '8001', VTS_REQUEST_ITEM_PERMISSION: 'false' };
  assert.equal(createAdapter('vtuber', { rootDir: '.', env }).name, 'vtuber');
  assert.equal(createAdapter('fake').name, 'fake');
  assert.throws(() => createAdapter('nope'), /adapter desconocido/);
});