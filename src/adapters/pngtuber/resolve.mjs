import fs from 'node:fs';
import path from 'node:path';
import { clipKind } from './formats.mjs';

const MAX_CLIP_BYTES = 30 * 1024 * 1024;

function insideRoot(rootDir, file) {
  const relative = path.relative(rootDir, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function resolveClip(resource, { rootDir } = {}) {
  if (!resource || resource.type !== 'clip' || typeof resource.file !== 'string') {
    return { clip: null, reason: 'not-a-clip' };
  }
  if (!rootDir) return { clip: null, reason: 'no-root' };
  const absolute = path.resolve(rootDir, resource.file);
  if (!insideRoot(path.resolve(rootDir), absolute)) {
    return { clip: null, reason: 'outside-root' };
  }
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
      file: resource.file,
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
  const scene = scenes[state?.effective] ?? {};
  const preferred = talking ? scene.talkingClip : null;
  const requestedId = preferred ?? scene.clip ?? state?.effective ?? 'idle';
  const candidates = [...new Set([requestedId, preferred ? scene.clip : null, 'idle'].filter(Boolean))];
  let fallback = false;
  for (const id of candidates) {
    const resource = assets[id] ? { ...assets[id], id } : null;
    const { clip } = resolveClip(resource, { rootDir });
    if (clip) return {
      scene: state?.effective ?? 'idle', requestedId, clip,
      missing: fallback ? requestedId : null, reason: null
    };
    fallback = true;
  }
  return { scene: state?.effective ?? 'idle', requestedId, clip: null, missing: requestedId, reason: 'missing' };
}