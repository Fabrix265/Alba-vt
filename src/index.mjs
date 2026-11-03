import fs from 'node:fs';
import { config as loadEnv, parse } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfigLoader } from './core/config-loader.mjs';
import { createBus } from './core/bus.mjs';
import { normalizeEvent, validateIntent } from './core/events.mjs';
import { createRulesEngine } from './core/rules-engine.mjs';
import { createDirector } from './core/director.mjs';
import { createAssetRegistry } from './core/assets.mjs';
import { createSpeech } from './core/speech.mjs';
import { createFakeAdapter } from './adapters/fake/index.mjs';
import { createVtsAdapter } from './adapters/vts/index.mjs';
import { createBridgeServer } from './api/server.mjs';
import { log, warn, warnOnce, error } from './core/log.mjs';

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

const adapterName = process.env.ALBA_ADAPTER ?? defaults.ALBA_ADAPTER;
if (!['vts', 'fake'].includes(adapterName)) {
  error('ALBA_ADAPTER debe ser vts o fake');
  process.exit(1);
}
const adapter = adapterName === 'fake' ? createFakeAdapter() : createVtsAdapter({
  port: Number(process.env.VTS_PORT ?? defaults.VTS_PORT), rootDir: root,
  token: process.env.VTS_AUTH_TOKEN,
  requestItemPermission: process.env.VTS_REQUEST_ITEM_PERMISSION === 'true'
});
let assets = createAssetRegistry({ assets: config.assets, rootDir: root });
assets.report();

const bus = createBus();
let rules = createRulesEngine({ rules: config.rules });
const director = createDirector({ scenes: config.scenes, persona: config.persona });
const speech = createSpeech({ onFrame: (value) => adapter.setMouth(value) });

adapter.applyState(director.getState(), {
  scenes: config.scenes,
  assets: config.assets,
  bindings: config.bindings
});

director.onChange((state) => {
  if (state.asleep) speech.stop();
  adapter.applyState(state, {
    scenes: config.scenes,
    assets: config.assets,
    bindings: config.bindings
  });
});

loader.onChange((next) => {
  config = next;
  rules = createRulesEngine({ rules: next.rules });
  director.updateConfig({ scenes: next.scenes, persona: next.persona });
  assets = createAssetRegistry({ assets: next.assets, rootDir: root });
  assets.report();
  log('config recargada');
});
loader.startWatching();

function handleEvent(raw) {
  const event = normalizeEvent(raw);
  if (director.getState().asleep) {
    return { event, decision: null, ignored: true, reason: 'asleep' };
  }
  bus.emit('event', event);
  if (event.type === 'say') {
    adapter.speak({ text: event.text ?? '' });
    const result = speech.speak({ text: event.text ?? '' });
    return {
      event,
      decision: null,
      speech: { durationMs: result.durationMs, synthetic: result.synthetic }
    };
  }
  const decision = rules.evaluate(event);
  if (decision) {
    const applied = director.applyIntent(decision.intent, {
      props: decision.args?.props ?? null
    });
    return { event, decision, applied };
  }
  return { event, decision: null };
}

function handleIntent(raw) {
  const intent = validateIntent(raw?.intent, director.listIntents());
  if (intent === 'deep_sleep' && !adapter.capabilities.processControl) {
    warnOnce('process-control', 'el cierre de VTS aun no esta implementado; Alba solo se pausara');
  }
  const props = Array.isArray(raw?.props) ? raw.props : null;
  const applied = director.applyIntent(intent, { props });
  return { intent, applied };
}

const server = createBridgeServer({
  port: bridgePort,
  token,
  getState: () => director.getState(),
  subscribe: (listener) => director.onChange(listener),
  onEvent: handleEvent,
  onIntent: handleIntent
});

const ticker = setInterval(() => director.tick(), 250);
ticker.unref?.();

try {
  const address = await server.start();
  log(`bridge escuchando en http://${address.address}:${address.port}`);
  log(`adapter: ${adapter.name} | intenciones: ${director.listIntents().join(', ')}`);
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
  speech.stop();
  await server.stop();
  await adapter.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
