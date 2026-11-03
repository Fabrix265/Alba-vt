import test from 'node:test';
import assert from 'node:assert/strict';
import { createRulesEngine } from '../../src/core/rules-engine.mjs';

const rules = {
  rules: [
    {
      id: 'angry',
      when: { type: 'error' },
      intent: 'angry',
      priority: 20,
      window: { count: 2, ms: 30000 }
    },
    {
      id: 'sad',
      when: { type: 'error' },
      intent: 'sad',
      priority: 10,
      window: { count: 3, ms: 120000 }
    },
    {
      id: 'coding',
      when: { type: 'tool.start', tool: ['bash', 'edit'] },
      intent: 'coding',
      cooldownMs: 1000,
      debounceMs: 100
    },
    {
      id: 'idle',
      when: { type: 'session.idle' },
      intent: 'idle',
      debounceMs: 500
    }
  ]
};

test('no dispara hasta alcanzar el contador de la ventana', () => {
  const engine = createRulesEngine({ rules });
  assert.equal(engine.evaluate({ type: 'error' }, 0), null);
  const decision = engine.evaluate({ type: 'error' }, 1000);
  assert.equal(decision.intent, 'angry');
  assert.equal(decision.rule, 'angry');
});

test('el tercer error dentro de la ventana dispara sad', () => {
  const engine = createRulesEngine({ rules });
  engine.evaluate({ type: 'error' }, 0);
  engine.evaluate({ type: 'error' }, 1000);
  const decision = engine.evaluate({ type: 'error' }, 2000);
  assert.equal(decision.intent, 'sad');
});

test('los errores fuera de la ventana reinician el contador', () => {
  const engine = createRulesEngine({ rules });
  engine.evaluate({ type: 'error' }, 0);
  assert.equal(engine.evaluate({ type: 'error' }, 40000), null);
});

test('cooldown evita repetir la misma regla', () => {
  const engine = createRulesEngine({ rules });
  const event = { type: 'tool.start', tool: 'bash' };
  assert.equal(engine.evaluate(event, 0).intent, 'coding');
  assert.equal(engine.evaluate(event, 500), null);
  assert.equal(engine.evaluate(event, 1500).intent, 'coding');
});

test('debounce ignora rafagas', () => {
  const engine = createRulesEngine({ rules });
  const event = { type: 'session.idle' };
  assert.equal(engine.evaluate(event, 0).intent, 'idle');
  assert.equal(engine.evaluate(event, 200), null);
  assert.equal(engine.evaluate(event, 600).intent, 'idle');
});

test('no dispara si la herramienta no coincide', () => {
  const engine = createRulesEngine({ rules });
  assert.equal(engine.evaluate({ type: 'tool.start', tool: 'read' }, 0), null);
});

test('textIncludes filtra por contenido', () => {
  const engine = createRulesEngine({
    rules: {
      rules: [
        { id: 'say-hola', when: { type: 'say', textIncludes: 'hola' }, intent: 'celebrate' }
      ]
    }
  });
  assert.equal(engine.evaluate({ type: 'say', text: 'HOLA mundo' }, 0).intent, 'celebrate');
  assert.equal(engine.evaluate({ type: 'say', text: 'adios' }, 1), null);
});

test('reset limpia los contadores', () => {
  const engine = createRulesEngine({ rules });
  engine.evaluate({ type: 'error' }, 0);
  engine.reset();
  assert.equal(engine.evaluate({ type: 'error' }, 1000), null);
});
