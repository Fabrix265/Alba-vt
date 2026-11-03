import fs from 'node:fs';
import path from 'node:path';
import { warnOnce } from './log.mjs';

export function createAssetRegistry({ assets = {}, rootDir, capabilities, logger = { warnOnce } }) {
  const declared = Object.fromEntries(
    Object.entries(assets).filter(([key]) => !key.startsWith('$'))
  );
  const itemsSupported = capabilities ? capabilities.has('items') : true;
  const resolved = new Map();

  function resolve(id) {
    if (!id || typeof id !== 'string') return null;
    if (!Object.prototype.hasOwnProperty.call(declared, id)) {
      logger.warnOnce(`asset-unknown:${id}`, `recurso desconocido: ${id}`);
      return null;
    }
    if (resolved.has(id)) return resolved.get(id);
    const resource = declared[id];
    if (resource.type !== 'item') {
      logger.warnOnce(
        `asset-type:${resource.type}`,
        `tipo de recurso no soportado todavia: ${resource.type} (${id})`
      );
      resolved.set(id, null);
      return null;
    }
    if (!itemsSupported) {
      logger.warnOnce(
        'items-unsupported',
        'el adapter no soporta items; los props no se cargaran'
      );
      resolved.set(id, null);
      return null;
    }
    const file = path.resolve(rootDir, resource.file);
    if (!fs.existsSync(file)) {
      logger.warnOnce(`asset-missing:${id}`, `falta el archivo del recurso ${id}: ${resource.file}`);
      resolved.set(id, null);
      return null;
    }
    const value = { id, ...resource, path: file };
    resolved.set(id, value);
    return value;
  }

  function list() {
    return Object.keys(declared);
  }

  function missing() {
    return list().filter((id) => resolve(id) === null);
  }

  function available() {
    return list().filter((id) => resolve(id) !== null);
  }

  function report() {
    // resolve() already reports each cause once; avoid a second summary warning.
    return { available: available(), missing: missing() };
  }

  return { resolve, list, missing, available, report };
}
