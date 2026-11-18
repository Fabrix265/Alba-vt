import fs from 'node:fs';
import { findAssetFile } from '../../core/paths.mjs';
import { clipKind, supportedClipExtensions } from './formats.mjs';

export const MAX_CLIP_BYTES = 30 * 1024 * 1024;

// Motivos legibles para doctor y los avisos del adapter.
export const CLIP_REASONS = Object.freeze({
  'not-a-clip': 'no es un recurso de tipo clip',
  'no-root': 'falta la carpeta del proyecto',
  'outside-assets': 'debe estar dentro de assets/',
  format: 'formato no admitido',
  'not-a-file': 'no es un archivo',
  'too-large': 'pesa mas de 30 MiB',
  missing: 'no existe el archivo',
  unreadable: 'no se pudo leer'
});

export function resolveClip(resource, { rootDir } = {}) {
  if (!resource || resource.type !== 'clip' || typeof resource.file !== 'string') {
    return { clip: null, reason: 'not-a-clip' };
  }
  if (!rootDir) return { clip: null, reason: 'no-root' };
  const found = findAssetFile(rootDir, resource.file, supportedClipExtensions());
  if (found.reason) return { clip: null, reason: found.reason };
  const absolute = found.path;
  const kind = clipKind(absolute);
  if (!kind) return { clip: null, reason: 'format' };
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return { clip: null, reason: 'not-a-file' };
    if (stat.size > MAX_CLIP_BYTES) return { clip: null, reason: 'too-large' };
  } catch (error) {
    return { clip: null, reason: error.code === 'ENOENT' ? 'missing' : 'unreadable' };
  }
  return {
    clip: {
      id: resource.id,
      file: found.file,
      kind,
      loop: resource.loop !== false,
      fit: resource.fit ?? 'contain'
    },
    reason: null
  };
}

export function selectClip({ state, context = {}, rootDir, talking = false } = {}) {
  const assets = context.assets ?? {};
  const scenes = context.scenes?.scenes ?? context.scenes ?? {};
  const sceneName = state?.effective ?? 'idle';
  const scene = scenes[sceneName] ?? {};
  const preferred = talking ? scene.talkingClip : null;
  const requestedId = preferred ?? scene.clip ?? sceneName;
  // Orden: clip de hablar -> clip de la escena -> idle -> marcador.
  const candidates = [...new Set([requestedId, preferred ? scene.clip : null, 'idle'].filter(Boolean))];
  for (const [index, id] of candidates.entries()) {
    const resource = assets[id] ? { ...assets[id], id } : null;
    const { clip } = resolveClip(resource, { rootDir });
    if (clip) return { scene: sceneName, requestedId, clip, missing: index > 0 ? requestedId : null, reason: null };
  }
  return { scene: sceneName, requestedId, clip: null, missing: requestedId, reason: 'missing' };
}
