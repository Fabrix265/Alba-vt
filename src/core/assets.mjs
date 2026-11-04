import fs from 'node:fs';
import path from 'node:path';
import { warnOnce } from './log.mjs';

const KNOWN_TYPES = new Set(['item', 'clip']);

export function createAssetRegistry({ assets = {}, rootDir, assetTypes, capabilities, logger = { warnOnce } }) {
  const declared = Object.fromEntries(
    Object.entries(assets).filter(([key]) => !key.startsWith('$'))
  );
  const explicitTypes = Array.isArray(assetTypes) ? new Set(assetTypes) : null;
  const itemsSupported = capabilities ? capabilities.has('items') : true;
  const clipsSupported = capabilities ? capabilities.has('clips') : false;
  const supported = (type) => explicitTypes
    ? explicitTypes.has(type)
    : type === 'item' ? itemsSupported : type === 'clip' ? clipsSupported : false;
  const resolved = new Map();
  const skipped = new Set();

  function resolve(id) {
    if (!id || typeof id !== 'string') return null;
    if (!Object.prototype.hasOwnProperty.call(declared, id)) {
      logger.warnOnce(`asset-unknown:${id}`, `recurso desconocido: ${id}`);
      return null;
    }
    if (resolved.has(id)) return resolved.get(id);
    const resource = declared[id];
    if (!KNOWN_TYPES.has(resource.type)) {
      logger.warnOnce(
        `asset-type:${resource.type}`,
        `tipo de recurso no soportado todavia: ${resource.type} (${id})`
      );
      resolved.set(id, null);
      return null;
    }
    if (!supported(resource.type)) {
      if (resource.type === 'item') {
        logger.warnOnce(
          'items-unsupported',
          'el adapter no soporta items; los props no se cargaran'
        );
      }
      skipped.add(id);
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
    return list().filter((id) => {
      const value = resolve(id);
      return value === null && !skipped.has(id);
    });
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