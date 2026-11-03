import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function readEnvironment({ rootDir = projectRoot, env = process.env } = {}) {
  const defaults = parse(fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8'));
  let local = {};
  try { local = parse(fs.readFileSync(path.join(rootDir, '.env'), 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('no se pudo leer .env');
  }
  return { ...defaults, ...local, ...env };
}

export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}