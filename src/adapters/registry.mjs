import { createFakeAdapter } from './fake/index.mjs';
import { createVtsAdapter } from './vts/index.mjs';

const ALIASES = Object.freeze({
  vts: 'vtuber',
  pet: 'pngtuber'
});

const FACTORIES = Object.freeze({
  vtuber: ({ rootDir, env }) => createVtsAdapter({
    port: Number(env.VTS_PORT),
    rootDir,
    token: env.VTS_AUTH_TOKEN,
    requestItemPermission: env.VTS_REQUEST_ITEM_PERMISSION === 'true'
  }),
  fake: () => createFakeAdapter()
});

export const ADAPTER_NAMES = Object.freeze(Object.keys(FACTORIES));

export function normalizeAdapterName(value) {
  const name = String(value ?? '').trim().toLowerCase();
  return ALIASES[name] ?? name;
}

export function isAdapterName(value) {
  return Object.hasOwn(FACTORIES, normalizeAdapterName(value));
}

export function createAdapter(value, options = {}) {
  const name = normalizeAdapterName(value);
  const factory = FACTORIES[name];
  if (!factory) {
    const available = [...ADAPTER_NAMES, ...Object.keys(ALIASES)].join(', ');
    throw new Error(`adapter desconocido: ${value}; usa ${available}`);
  }
  return factory(options);
}
