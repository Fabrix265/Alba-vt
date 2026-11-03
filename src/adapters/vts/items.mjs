import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function createVtsItems({ client, rootDir, warn }) {
  const loaded = new Map();
  const failed = new Set();

  async function unload(id, instance) {
    await client.request('ItemUnloadRequest', {
      unloadAllInScene: false, unloadAllLoadedByThisPlugin: false,
      allowUnloadingItemsLoadedByUserOrOtherPlugins: false, instanceIDs: [instance.instanceID]
    });
    loaded.delete(id);
  }

  async function sync(ids, assets, permitted, isCurrent = () => true) {
    const desired = new Set(permitted ? ids : []);
    for (const [id, instance] of loaded) {
      if (!isCurrent()) return;
      if (!desired.has(id) || instance.signature !== JSON.stringify(assets[id])) {
        try { await unload(id, instance); } catch {
          warn(`item-unload:${id}`, `VTS: no se pudo retirar el prop ${id}; se reintentara`);
        }
      }
    }
    if (!permitted && ids.length) warn('items-permission', 'VTS: falta LoadCustomImagesAsItems; props omitidos');
    for (const id of desired) {
      if (!isCurrent()) return;
      const asset = assets[id];
      const signature = JSON.stringify(asset);
      const failureKey = `${id}:${signature}`;
      if (loaded.has(id) || failed.has(failureKey)) continue;
      if (!asset) {
        warn(`asset-unknown:${id}`, `recurso desconocido: ${id}`);
        continue;
      }
      if (asset.type !== 'item') {
        warn(`asset-type:${asset.type}`, `tipo de recurso no soportado todavia: ${asset.type} (${id})`);
        continue;
      }
      try {
        const file = await fs.realpath(path.resolve(rootDir, asset.file));
        const root = await fs.realpath(rootDir);
        const relative = path.relative(root, file);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error('archivo fuera del proyecto');
        }
        const extension = path.extname(file).toLowerCase();
        const stat = await fs.stat(file);
        if (!['.png', '.jpg', '.gif'].includes(extension) || !stat.isFile() || stat.size >= 5 * 1024 * 1024) {
          throw new Error('formato o tamano de imagen no permitido');
        }
        const bytes = await fs.readFile(file);
        if (!isCurrent()) return;
        const name = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
        const result = await client.request('ItemLoadRequest', {
          fileName: `alba-${name}${extension}`,
          positionX: asset.position?.x ?? 0, positionY: asset.position?.y ?? 0,
          size: Math.max(0, Math.min(1, asset.size ?? 0.32)),
          rotation: asset.position?.rotation ?? 0,
          fadeTime: 0.25, order: 0, failIfOrderTaken: false,
          smoothing: 0, censored: false, flipped: false, locked: false,
          unloadWhenPluginDisconnects: true,
          customDataBase64: bytes.toString('base64'), customDataAskUserFirst: false
        });
        if (typeof result.instanceID !== 'string' || !result.instanceID) throw new Error('sin instancia');
        loaded.set(id, { instanceID: result.instanceID, signature });
        // A state change during the load must not leave a stale prop on screen.
        if (!isCurrent()) await unload(id, loaded.get(id));
      } catch (error) {
        if (!isCurrent()) return;
        failed.add(failureKey);
        if (error.code === 'ENOENT') warn(`asset-missing:${id}`, `falta el archivo del recurso ${id}: ${asset.file}`);
        else warn(`item-load:${id}`, `VTS: no se pudo cargar el prop ${id}; revisa archivo, formato y permisos`);
      }
    }
  }

  return {
    sync,
    reset() { loaded.clear(); failed.clear(); },
    retry() { failed.clear(); },
    list() { return [...loaded.keys()]; }
  };
}
