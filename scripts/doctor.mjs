import path from 'node:path';
import { readEnvironment, projectRoot, isMain } from '../src/environment.mjs';
import { createConfigLoader } from '../src/core/config-loader.mjs';
import { createAssetRegistry } from '../src/core/assets.mjs';
import { selectBinding } from '../src/adapters/vts/translate.mjs';
import { createVtsClient } from '../src/adapters/vts/client.mjs';
import { createVtsAuth, readAuthToken } from '../src/adapters/vts/auth.mjs';

export async function runDoctor({
  rootDir = projectRoot, env = process.env, nodeVersion = process.versions.node,
  authTimeoutMs = 60000, requestTimeoutMs = 5000, connectTimeoutMs = 3000,
  announce = () => {}
} = {}) {
  const checks = [];
  const inventory = { model: null, hotkeys: [], parameters: [], permissions: [], assets: [] };
  const check = (status, name, message) => checks.push({ status, name, message });
  const result = () => ({ ok: !checks.some((entry) => entry.status === 'error'), checks, inventory });
  check(Number(nodeVersion.split('.')[0]) >= 24 ? 'ok' : 'error', 'Node', `${nodeVersion}; se requiere Node 24 o superior`);
  let settings;
  try { settings = readEnvironment({ rootDir, env }); } catch {
    check('error', 'Entorno', 'No se pudo leer .env o .env.example. Revisa los permisos de lectura.');
    return result();
  }
  check(settings.ALBA_TOKEN?.trim() ? 'ok' : 'error', 'Bridge', settings.ALBA_TOKEN?.trim()
    ? 'ALBA_TOKEN configurado (valor oculto)'
    : 'Falta ALBA_TOKEN. Guarda un token aleatorio en .env antes de arrancar el bridge.');
  let config;
  try {
    config = createConfigLoader({ configDir: path.join(rootDir, 'config') }).load({ initial: true });
    check('ok', 'Config', 'Todos los JSON cumplen sus schemas');
    const registry = createAssetRegistry({ assets: config.assets, rootDir, logger: { warnOnce() {} } });
    inventory.assets = registry.list().map((id) => ({ id, type: config.assets[id].type, available: Boolean(registry.resolve(id)) }));
    const missing = inventory.assets.filter((asset) => !asset.available).map((asset) => asset.id);
    check(missing.length ? 'warning' : 'ok', 'Recursos', missing.length
      ? `Ausentes o no compatibles: ${missing.join(', ')}. Revisa assets.json y añade tus archivos; son opcionales.`
      : 'Todos los recursos declarados estan disponibles');
  } catch {
    check('error', 'Config', 'Configuracion invalida. Revisa config/ y sus schemas antes de arrancar.');
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
    for (const a of report.inventory.assets) lines.push(`  ${a.id} (${a.type}): ${a.available ? 'presente' : 'ausente/no compatible'}`);
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