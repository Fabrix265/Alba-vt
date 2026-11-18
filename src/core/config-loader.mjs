import fs from 'node:fs';
import path from 'node:path';
import { assertValid } from './validate.mjs';
import { warnOnce, warn, error } from './log.mjs';

export const CONFIG_FILES = Object.freeze([
  'persona',
  'scenes',
  'rules',
  'bindings',
  'assets',
  'commands'
]);

export function createConfigLoader({ configDir } = {}) {
  if (!configDir) throw new Error('createConfigLoader necesita configDir');
  const schemaDir = path.join(configDir, 'schemas');
  let current = {};
  let watchers = [];
  let timer = null;
  const listeners = new Set();

  function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  function loadFile(name) {
    const file = path.join(configDir, `${name}.json`);
    const schemaFile = path.join(schemaDir, `${name}.schema.json`);
    if (!fs.existsSync(file)) throw new Error(`falta ${name}.json`);
    if (!fs.existsSync(schemaFile)) throw new Error(`falta schemas/${name}.schema.json`);
    const schema = readJson(schemaFile);
    const data = readJson(file);
    assertValid(schema, data, `${name}.json`);
    return data;
  }

  function load({ initial = false } = {}) {
    const next = { ...current };
    const problems = [];
    for (const name of CONFIG_FILES) {
      try {
        next[name] = loadFile(name);
      } catch (err) {
        problems.push({ name, err });
      }
    }
    if (initial && problems.length > 0) {
      const detail = problems.map(({ name, err }) => `${name}.json: ${err.message}`).join('\n');
      throw new Error(`configuracion inicial invalida:\n${detail}`);
    }
    for (const { name, err } of problems) {
      warnOnce(
        `config-invalid:${name}`,
        `config ${name}.json invalida; conservo la ultima version valida: ${err.message}`
      );
    }
    current = next;
    return current;
  }

  function reload() {
    const next = load();
    for (const listener of [...listeners]) listener(next);
    return next;
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function stopWatching() {
    for (const watcher of watchers) watcher.close();
    watchers = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function startWatching() {
    if (watchers.length > 0) return stopWatching;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        try {
          reload();
        } catch (err) {
          error('recarga de config fallida:', err.message);
        }
      }, 150);
      timer.unref?.();
    };
    for (const dir of [configDir, schemaDir]) {
      if (!fs.existsSync(dir)) continue;
      try {
        watchers.push(fs.watch(dir, { persistent: false }, schedule));
      } catch (err) {
        warn(`no se pudo vigilar ${dir}: ${err.message}`);
      }
    }
    return stopWatching;
  }

  function getConfig() {
    return current;
  }

  return { load, reload, onChange, startWatching, stopWatching, getConfig, files: CONFIG_FILES };
}
