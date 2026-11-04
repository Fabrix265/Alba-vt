export const PET_PROTOCOL_VERSION = 1;

export function helloMessage({ port } = {}) {
  return { type: 'hello', version: PET_PROTOCOL_VERSION, mode: 'pngtuber', port: port ?? null };
}

export function stateMessage({ state, scene, clip, talking } = {}) {
  return {
    type: 'state',
    version: PET_PROTOCOL_VERSION,
    scene: scene ?? state?.effective ?? 'idle',
    effective: state?.effective ?? 'idle',
    asleep: Boolean(state?.asleep),
    deepSleep: Boolean(state?.deepSleep),
    talking: Boolean(talking),
    clip: clip ?? null
  };
}

export function parseClientMessage(raw) {
  try {
    const parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}