import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfigLoader } from '../../src/core/config-loader.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const realConfig = path.join(repoRoot, 'config');

function tempConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alba-config-'));
  const target = path.join(dir, 'config');
  fs.cpSync(realConfig, target, { recursive: true });
  return { dir, target };
}

test('carga la configuracion real y valida todos los schemas', () => {
  const loader = createConfigLoader({ configDir: realConfig });
  const config = loader.load({ initial: true });
  assert.equal(config.persona.name, 'Alba');
  assert.ok(config.scenes.scenes.coding);
  assert.deepEqual(config.scenes.scenes.coding.props, ['keyboard']);
  assert.ok(Array.isArray(config.rules.rules));
  assert.ok(config.rules.rules.length >= 5);
  assert.equal(config.commands.commands['good night'].intent, 'sleep');
  assert.ok(config.bindings.default.parameters.mouth);
});

test('si un JSON se vuelve invalido conserva la ultima version valida', () => {
  const { dir, target } = tempConfig();
  try {
    const loader = createConfigLoader({ configDir: target });
    const first = loader.load({ initial: true });
    assert.equal(first.persona.name, 'Alba');

    fs.writeFileSync(path.join(target, 'persona.json'), '{ "name": 42 }', 'utf8');
    const second = loader.reload();
    assert.equal(second.persona.name, 'Alba');

    fs.writeFileSync(path.join(target, 'persona.json'), '{ roto', 'utf8');
    const third = loader.reload();
    assert.equal(third.persona.name, 'Alba');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('la carga inicial falla con mensaje claro si hay un JSON invalido', () => {
  const { dir, target } = tempConfig();
  try {
    fs.writeFileSync(path.join(target, 'scenes.json'), '{ "scenes": {} }', 'utf8');
    const loader = createConfigLoader({ configDir: target });
    assert.throws(
      () => loader.load({ initial: true }),
      (err) => err.message.includes('configuracion inicial invalida') && err.message.includes('scenes.json')
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('notifica a los suscriptores al recargar', () => {
  const { dir, target } = tempConfig();
  try {
    const loader = createConfigLoader({ configDir: target });
    loader.load({ initial: true });
    let received = null;
    loader.onChange((config) => {
      received = config;
    });
    loader.reload();
    assert.equal(received.persona.name, 'Alba');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
