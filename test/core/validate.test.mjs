import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, assertValid, SchemaError } from '../../src/core/validate.mjs';

const persona = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
    limits: {
      type: 'object',
      properties: {
        minStateDurationMs: { type: 'number', minimum: 0 },
        maxTransientsPerMinute: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

test('acepta un objeto valido', () => {
  assert.deepEqual(validate(persona, { name: 'Alba', limits: { minStateDurationMs: 10 } }), []);
});

test('reporta un campo obligatorio ausente con su ruta', () => {
  const errors = validate(persona, {});
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, '$.name');
  assert.match(errors[0].message, /obligatorio/);
});

test('rechaza tipos incorrectos', () => {
  const errors = validate(persona, { name: 42 });
  assert.equal(errors[0].path, '$.name');
  assert.match(errors[0].message, /se esperaba string/);
});

test('rechaza propiedades no permitidas', () => {
  const errors = validate(persona, { name: 'Alba', extra: true });
  assert.equal(errors[0].path, '$.extra');
  assert.match(errors[0].message, /no permitida/);
});

test('valida enum, patron y minimos', () => {
  const schema = {
    type: 'object',
    properties: {
      layer: { enum: ['base', 'activity'] },
      id: { type: 'string', pattern: '^[a-z-]+$' },
      count: { type: 'integer', minimum: 2 }
    }
  };
  const errors = validate(schema, { layer: 'transient', id: 'Mal Id', count: 1 });
  assert.equal(errors.length, 3);
});

test('soporta anyOf para texto o lista de textos', () => {
  const schema = {
    anyOf: [
      { type: 'string' },
      { type: 'array', items: { type: 'string' } }
    ]
  };
  assert.deepEqual(validate(schema, 'bash'), []);
  assert.deepEqual(validate(schema, ['bash', 'edit']), []);
  assert.equal(validate(schema, 5).length, 1);
});

test('soporta $ref dentro de $defs', () => {
  const schema = {
    type: 'object',
    properties: { rule: { $ref: '#/$defs/rule' } },
    $defs: {
      rule: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    }
  };
  assert.deepEqual(validate(schema, { rule: { id: 'x' } }), []);
  assert.equal(validate(schema, { rule: {} })[0].path, '$.rule.id');
});

test('valida uniqueItems y minProperties', () => {
  const schema = {
    type: 'object',
    minProperties: 1,
    properties: {
      props: { type: 'array', items: { type: 'string' }, uniqueItems: true }
    }
  };
  assert.equal(validate(schema, { props: ['a', 'a'] })[0].path, '$.props');
  assert.equal(validate(schema, {})[0].message, 'debe tener al menos 1 propiedades');
});

test('assertValid lanza SchemaError con etiqueta', () => {
  assert.throws(
    () => assertValid(persona, {}, 'persona.json'),
    (err) => err instanceof SchemaError && err.message.includes('persona.json')
  );
});
