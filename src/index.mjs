import fs from 'node:fs';
import { config as loadEnv, parse } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfigLoader } from './core/config-loader.mjs';
import { createApp } from './app.mjs';
import { createVtsProcess } from './platform/vts-process.mjs';
import { createAssetRegistry } from './core/assets.mjs';
import { createAdapter, isAdapterName, normalizeAdapterName } from './adapters/registry.mjs';
import { createBridgeServer } from './api/server.mjs';
import { log, warn, error } from './core/log.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
loadEnv({ path: path.join(root, '.env'), quiet: true });
const defaults = parse(fs.readFileSync(path.join(root, '.env.example'), 'utf8'));
const configDir = path.join(root, 'config');
const bridgePort = Number(process.env.ALBA_BRIDGE_PORT ?? defaults.ALBA_BRIDGE_PORT);
const token = process.env.ALBA_TOKEN ?? '';

const loader = createConfigLoader({ configDir });
let config;
try {
  config = loader.load({ initial: true });
} catch (err) {
  error(err.message);
  process.exit(1);
}

const env = { ...defaults, ...process.env };
const adapterName = env.ALBA_ADAPTER ?? defaults.ALBA_ADAPTER;
if (!isAdapterName(adapterName)) {
  error('ALBA_ADAPTER debe ser vtuber, pngtuber o fake');
  process.exit(1);
}
const adapter = createAdapter(normalizeAdapterName(adapterName), { rootDir: root, env });
let assets = createAssetRegistry({ assets: config.assets, rootDir: root, assetTypes: adapter.assetTypes });
assets.report();

const processControl = adapter.name === 'vtuber' ? createVtsProcess({ env }) : undefined;
const app = createApp({ config, adapter, processControl });
loader.onChange((next) => {
  config = next;
  app.updateConfig(next);
  assets = createAssetRegistry({ assets: next.assets, rootDir: root, assetTypes: adapter.assetTypes });
  assets.report();
  log('config recargada');
});
loader.startWatching();

const server = createBridgeServer({
  port: bridgePort, token,
  getState: app.getState, subscribe: app.onChange,
  onEvent: app.handleEvent, onIntent: app.handleIntent
});

const ticker = setInterval(() => app.tick(), 250);
ticker.unref?.();

try {
  const address = await server.start();
  log(`bridge escuchando en http://${address.address}:${address.port}`);
  log(`adapter: ${adapter.name} | intenciones: ${app.getState().intents.join(', ')}`);
} catch (err) {
  error(`no se pudo arrancar el bridge: ${err.message}`);
  process.exit(1);
}

// HTTP remains available while VTS is closed or awaiting user authorization.
void adapter.connect();

if (!token) {
  warn('ALBA_TOKEN esta vacio: el bridge rechazara todas las peticiones hasta configurarlo.');
}

async function shutdown(signal) {
  log(`${signal}: cerrando`);
  clearInterval(ticker);
  loader.stopWatching();
  app.stop();
  await server.stop();
  await adapter.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
