import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent, validateIntent, EventError, EVENT_TYPES } from '../../src/core/events.mjs';

test('normaliza un evento completo', () => {
  const event = normalizeEvent({
    source: 'opencode',
    type: 'tool.start',
    tool: 'bash',
    ok: true,
    text: 'ls',
    meta: { session: 1 }
  });
  assert.deepEqual(event, {
    source: 'opencode',
    type: 'tool.start',
    tool: 'bash',
    ok: true,
    text: 'ls',
    meta: { session: 1 }
  });
});

test('rellena los campos opcionales', () => {
  const event = normalizeEvent({ type: 'session.idle' });
  assert.deepEqual(event, {
    source: 'unknown',
    type: 'session.idle',
    tool: null,
    ok: null,
    text: null,
    meta: {}
  });
});

test('rechaza tipos de evento desconocidos', () => {
  assert.throws(() => normalizeEvent({ type: 'nope' }), EventError);
  assert.throws(() => normalizeEvent({ type: 'nope' }), /type debe ser uno de/);
});

test('rechaza payloads que no son objeto', () => {
  assert.throws(() => normalizeEvent(null), EventError);
  assert.throws(() => normalizeEvent([]), EventError);
});

test('rechaza campos con tipo incorrecto', () => {
  assert.throws(() => normalizeEvent({ type: 'say', text: 5 }), /text debe ser texto/);
  assert.throws(() => normalizeEvent({ type: 'error', ok: 'si' }), /ok debe ser booleano/);
  assert.throws(() => normalizeEvent({ type: 'error', meta: [] }), /meta debe ser un objeto/);
});

test('todos los tipos canonicos son aceptados', () => {
  for (const type of EVENT_TYPES) {
    assert.equal(normalizeEvent({ type }).type, type);
  }
});

test('validateIntent respeta el vocabulario conocido', () => {
  const known = new Set(['idle', 'coding', 'wake']);
  assert.equal(validateIntent('coding', known), 'coding');
  assert.throws(() => validateIntent('fly', known), /intent desconocida/);
  assert.throws(() => validateIntent('', known), /intent debe ser texto/);
});
