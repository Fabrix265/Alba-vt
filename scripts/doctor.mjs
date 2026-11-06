import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readEnvironment, projectRoot, isMain } from '../src/environment.mjs';
import { createConfigLoader } from '../src/core/config-loader.mjs';
import { createAssetRegistry } from '../src/core/assets.mjs';
import { createAdapter, isAdapterName, normalizeAdapterName } from '../src/adapters/registry.mjs';
import { selectBinding } from '../src/adapters/vts/translate.mjs';
import { createVtsClient } from '../src/adapters/vts/client.mjs';
import { createVtsAuth, readAuthToken } from '../src/adapters/vts/auth.mjs';
import { parseSize } from '../desktop/state.mjs';

const require = createRequire(import.meta.url);

function electronStatus(rootDir) {
  try {
    const entry = require.resolve('electron', { paths: [rootDir] });
    if (!fs.existsSync(path.join(path.dirname(entry), 'path.txt'))) return { ready: false, reason: 'binary' };
    return { ready: true, reason: null };
  } catch {
    return { ready: false, reason: 'missing' };
  }
}

export async function runDoctor({
  rootDir = projectRoot, env = process.env, nodeVersion = process.versions.node,
  authTimeoutMs = 60000, requestTimeoutMs = 5000, connectTimeoutMs = 3000,
  announce = () => {}
} = {}) {
  const checks = [];
  const inventory = {
    adapter: null, model: null, hotkeys: [], parameters: [], permissions: [], assets: []
  };
  const check = (status, name, message) => checks.push({ status, name, message });
  const result = () => ({ ok: !checks.some((entry) => entry.status === 'error'), checks, inventory });
  check(Number(nodeVersion.split('.')[0]) >= 24 ? 'ok' : 'error', 'Node', `${nodeVersion}; se requiere Node 24 o superior`);
  let settings;
  try { settings = readEnvironment({ rootDir, env }); } catch {
    check('error', 'Entorno', 'No se pudo leer .env o .env.example. Revisa los permisos de lectura.');
    return result();
  }
  const adapterName = normalizeAdapterName(settings.ALBA_ADAPTER);
  let adapter = null;
  try {
    if (!isAdapterName(adapterName)) throw new Error(`adapter desconocido: ${settings.ALBA_ADAPTER}`);
    adapter = createAdapter(adapterName, { rootDir, env: settings });
    inventory.adapter = adapter.name;
    check('ok', 'Adapter', `${adapter.name} seleccionado con ALBA_ADAPTER`);
  } catch {
    check('error', 'Adapter', `ALBA_ADAPTER no es valido. Usa vtuber, pngtuber o fake.`);
  }
  check(settings.ALBA_TOKEN?.trim() ? 'ok' : 'error', 'Bridge', settings.ALBA_TOKEN?.trim()
    ? 'ALBA_TOKEN configurado (valor oculto)'
    : 'Falta ALBA_TOKEN. Guarda un token aleatorio en .env antes de arrancar el bridge.');
  let config;
  try {
    config = createConfigLoader({ configDir: path.join(rootDir, 'config') }).load({ initial: true });
    check('ok', 'Config', 'Todos los JSON cumplen sus schemas');
    const registry = createAssetRegistry({
      assets: config.assets, rootDir, assetTypes: adapter?.assetTypes,
      logger: { warnOnce() {} }
    });
    inventory.assets = registry.list().map((id) => {
      const type = config.assets[id].type;
      const supported = !adapter?.assetTypes || adapter.assetTypes.includes(type);
      const available = supported ? Boolean(registry.resolve(id)) : false;
      return { id, type, supported, available };
    });
    const missing = inventory.assets.filter((asset) => asset.supported && !asset.available).map((asset) => asset.id);
    check(missing.length ? 'warning' : 'ok', 'Recursos', missing.length
      ? `Ausentes o no compatibles: ${missing.join(', ')}. Revisa assets.json y a\u00f1ade tus archivos; son opcionales.`
      : 'Todos los recursos declarados estan disponibles');
  } catch {
    check('error', 'Config', 'Configuracion invalida. Revisa config/ y sus schemas antes de arrancar.');
  }
  if (!adapter) return result();
  if (adapter.name === 'fake') {
    check('ok', 'Modo', 'fake: no abre VTS ni una ventana; util para demos y tests');
    return result();
  }
  if (adapter.name === 'pngtuber') {
    const petToken = settings.ALBA_PET_TOKEN?.trim() || settings.ALBA_TOKEN?.trim();
    check(petToken ? 'ok' : 'error', 'Token PNGTuber', petToken
      ? 'ALBA_PET_TOKEN o ALBA_TOKEN configurado (valor oculto)'
      : 'Falta ALBA_PET_TOKEN y ALBA_TOKEN; la ventana no podra autenticarse.');
    const petPort = Number(settings.ALBA_PET_PORT);
    check(Number.isInteger(petPort) && petPort > 0 && petPort < 65536 ? 'ok' : 'error', 'Puerto PNGTuber',
      Number.isInteger(petPort) && petPort > 0 && petPort < 65536
        ? `WebSocket local en 127.0.0.1:${petPort}`
        : 'ALBA_PET_PORT debe ser un puerto entre 1 y 65535.');
    const electron = electronStatus(rootDir);
    if (electron.ready) check('ok', 'Electron', 'Binario disponible para la ventana de escritorio');
    else check('warning', 'Electron', electron.reason === 'binary'
      ? 'El binario aun no esta descargado. Ejecuta npm run pet una vez.'
      : 'Electron no esta instalado. Instala dependencias opcionales o usa npm run pet.');
    check(settings.ALBA_PET_LAUNCH === 'false' ? 'warning' : 'ok', 'Ventana PNGTuber',
      settings.ALBA_PET_LAUNCH === 'false'
        ? 'ALBA_PET_LAUNCH=false: abre la ventana a mano con npm run pet'
        : 'Se abrira automaticamente al arrancar el bridge');
    const petWindowRaw = String(settings.ALBA_PET_WINDOW ?? '').trim();
    if (petWindowRaw) {
      const petWindow = parseSize(petWindowRaw);
      check(petWindow ? 'ok' : 'warning', 'Tamano PNGTuber', petWindow
        ? `ALBA_PET_WINDOW=${petWindow.width}x${petWindow.height} (manda sobre el tamano guardado)`
        : `ALBA_PET_WINDOW="${petWindowRaw}" no es valido. Usa anchoxalto entre 100 y 4000, p. ej. 240x240.`);
    }
    const clips = inventory.assets.filter((asset) => asset.type === 'clip');
    const readyClips = clips.filter((asset) => asset.available);
    if (!clips.length) {
      check('warning', 'Clips PNGTuber', 'No hay clips declarados. La ventana mostrara el marcador hasta que agregues assets.');
    } else if (!readyClips.length) {
      check('warning', 'Clips PNGTuber', `${clips.length} clips declarados, ninguno disponible. La ventana mostrara el marcador.`);
    } else if (readyClips.length < clips.length) {
      check('warning', 'Clips PNGTuber', `${readyClips.length} de ${clips.length} clips disponibles; el resto usara el marcador.`);
    } else {
      check('ok', 'Clips PNGTuber', `${readyClips.length} clips disponibles para la ventana`);
    }
    return result();
  }
  let client;
  try {
    client = createVtsClient({
      port: Number(settings.VTS_PORT), connectTimeoutMs, requestTimeoutMs
    });
    await client.connect();
    const api = await client.request('APIStateRequest');
    if (api.active !== true) throw new Error('API inactiva');
    check('ok', 'VTS', `Plugin API accesible en 127.0.0.1:${Number(settings.VTS_PORT)}`);
  } catch {
    check('error', 'VTS', 'Abre VTube Studio y activa Allow Plugin API access. Revisa VTS_PORT en .env.');
    await client?.disconnect();
    return result();
  }
  try {
    const envPath = path.join(rootDir, '.env');
    try {
      await createVtsAuth({
        envPath, token: settings.VTS_AUTH_TOKEN, timeoutMs: authTimeoutMs,
        logger: { log: announce }
      }).authenticate(client);
      check('ok', 'Autenticacion', 'Plugin Alba autorizado');
      const saved = Boolean(await readAuthToken(envPath));
      check(saved ? 'ok' : 'warning', 'Token VTS', saved
        ? 'Guardado en .env (valor oculto)'
        : 'Autenticado, pero el token no esta guardado en .env.');
    } catch {
      check('error', 'Autenticacion', 'Autoriza Alba en el popup de VTS y vuelve a ejecutar doctor. No se muestran tokens.');
      return result();
    }
    const requests = ['CurrentModelRequest', 'HotkeysInCurrentModelRequest', 'InputParameterListRequest', 'PermissionRequest'];
    const responses = await Promise.allSettled(requests.map((type) => client.request(type,
      type === 'PermissionRequest' ? { requestedPermission: '' } : {})));
    const data = responses.map((response, index) => {
      if (response.status === 'fulfilled') return response.value;
      check(index === 0 ? 'error' : 'warning', requests[index], 'VTS no pudo completar esta consulta. Cierra los menus de VTS y reintenta.');
      return {};
    });
    const model = data[0];
    if (model.modelLoaded) {
      inventory.model = { id: model.modelID, name: model.modelName };
      check('ok', 'Modelo', `${model.modelName} | ID: ${model.modelID}`);
    } else {
      check('error', 'Modelo', 'No hay modelo cargado. Selecciona un modelo en VTS y vuelve a ejecutar doctor.');
    }
    inventory.hotkeys = (data[1].availableHotkeys ?? []).map(({ hotkeyID, name, type }) => ({ id: hotkeyID, name, type }));
    inventory.parameters = [...(data[2].defaultParameters ?? []), ...(data[2].customParameters ?? [])]
      .map(({ name, min, max }) => ({ name, min, max }));
    inventory.permissions = (data[3].permissions ?? []).map(({ name, granted }) => ({ name, granted: granted === true }));
    check(inventory.hotkeys.length ? 'ok' : 'warning', 'Hotkeys', `${inventory.hotkeys.length} disponibles; usa sus nombres o IDs en bindings.json`);
    check(inventory.parameters.length ? 'ok' : 'warning', 'Parametros', `${inventory.parameters.length} entradas disponibles`);
    const items = inventory.permissions.some((permission) => permission.name === 'LoadCustomImagesAsItems' && permission.granted);
    check(items ? 'ok' : 'warning', 'Permiso de imagenes', items
      ? 'LoadCustomImagesAsItems concedido'
      : 'Props omitidos. Para solicitarlos, usa VTS_REQUEST_ITEM_PERMISSION=true al arrancar el bridge y acepta el popup.');
    if (config && model.modelLoaded) {
      const binding = selectBinding(config.bindings, model);
      const missing = Object.entries(binding.parameters).filter(([, id]) => !inventory.parameters.some((p) => p.name === id));
      check(missing.length ? 'warning' : 'ok', 'Bindings', missing.length
        ? `${binding.key}: entradas ausentes para ${missing.map(([alias]) => alias).join(', ')}. Corrige bindings.json con la lista de abajo.`
        : `${binding.key}: parametros verificados`);
    }
    return result();
  } finally {
    await client.disconnect();
  }
}

export function formatDoctor(report) {
  const labels = { ok: 'OK', warning: 'AVISO', error: 'ERROR' };
  const lines = report.checks.map((check) => `[${labels[check.status]}] ${check.name}: ${check.message}`);
  if (report.inventory.hotkeys.length) {
    lines.push('\nHotkeys reales (nombre | ID | tipo):');
    for (const h of report.inventory.hotkeys) lines.push(`  ${h.name || '(sin nombre)'} | ${h.id} | ${h.type}`);
  }
  if (report.inventory.parameters.length) {
    lines.push('\nParametros de entrada (nombre | rango):');
    for (const p of report.inventory.parameters) lines.push(`  ${p.name} | ${p.min} .. ${p.max}`);
  }
  if (report.inventory.permissions.length) {
    lines.push('\nPermisos:');
    for (const p of report.inventory.permissions) lines.push(`  ${p.name}: ${p.granted ? 'concedido' : 'no concedido'}`);
  }
  if (report.inventory.assets.length) {
    lines.push('\nRecursos:');
    for (const a of report.inventory.assets) {
      const state = a.supported === false ? 'no aplica al adapter' : a.available ? 'presente' : 'ausente/no compatible';
      lines.push(`  ${a.id} (${a.type}): ${state}`);
    }
  }
  lines.push(report.ok ? '\nDoctor OK. Los avisos indican funciones opcionales degradadas.' : '\nDoctor encontro errores; sigue las indicaciones anteriores.');
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--json')) {
    console.error('Uso: npm run doctor -- [--json]');
    process.exitCode = 1;
  } else {
    const json = args.includes('--json');
    const report = await runDoctor({ announce: (message) => console.error(message) });
    console.log(json ? JSON.stringify(report, null, 2) : formatDoctor(report));
    process.exitCode = report.ok ? 0 : 1;
  }
}
