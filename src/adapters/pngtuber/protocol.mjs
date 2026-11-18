export const PET_PROTOCOL_VERSION = 1;
export const MAX_SAY_LENGTH = 280;

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

// Texto del globo de dialogo. Se recorta para que nunca tape la ventana entera.
export function sayMessage(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const short = clean.length > MAX_SAY_LENGTH ? `${clean.slice(0, MAX_SAY_LENGTH - 1)}…` : clean;
  return { type: 'say', version: PET_PROTOCOL_VERSION, text: short };
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
