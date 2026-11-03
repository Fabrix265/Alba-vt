import path from 'node:path';
import { createVtsClient } from './client.mjs';
import { createVtsAuth } from './auth.mjs';
import { createVtsItems } from './items.mjs';
import { translateScene, translateParameters, selectBinding } from './translate.mjs';
import { log, warnOnce as logWarnOnce } from '../../core/log.mjs';

export function reconnectDelay(attempt, baseMs, maxMs) {
  return Math.min(maxMs, baseMs * 2 ** Math.min(attempt, 30));
}

export function createVtsAdapter({
  port, rootDir, envPath = path.join(rootDir, '.env'), token,
  client = createVtsClient({ port }), logger = { log, warnOnce: logWarnOnce },
  reconnectBaseMs = 500, reconnectMaxMs = 30000,
  refreshIntervalMs = 2000, injectionIntervalMs = 250,
  requestItemPermission = false, authTimeoutMs = 60000
} = {}) {
  const seen = new Set();
  const warnOnce = (key, message) => {
    if (seen.has(key)) return;
    seen.add(key);
    if (logger.warnOnce) logger.warnOnce(key, message);
    else logger.warn?.(message);
  };
  const auth = createVtsAuth({ envPath, token, timeoutMs: authTimeoutMs, logger });
  const items = createVtsItems({ client, rootDir, warn: warnOnce });
  let catalog = { model: null, hotkeys: [], parameters: [], permissions: [] };
  let capabilities = { hotkeys: false, parameters: false, items: false, modelDetection: false, processControl: false };
  let running = false;
  let ready = false;
  let generation = 0;
  let attempt = 0;
  let connectionTask = null;
  let reconnectTimer = null;
  let refreshTimer = null;
  let injectionTimer = null;
  let refreshing = false;
  let injecting = false;
  let permissionAsked = false;
  let desired = null;
  let revision = 0;
  let renderTask = null;
  let renderedRevision = -1;
  let lastSceneKey = '';
  let parameterValues = [];
  let mouth = null;
  let lastInjectionAt = Number.NEGATIVE_INFINITY;

  function injectionPolicy() {
    const state = desired?.state;
    const scenes = desired?.context.scenes;
    const scene = (scenes?.scenes ?? scenes)?.[state?.effective];
    return {
      allowed: Boolean(state && !state.deepSleep && (!state.asleep || scene?.holdPoseWhileAsleep === true)),
      asleep: state?.asleep === true,
      intervalMs: scene?.parameterRefreshMs ?? injectionIntervalMs
    };
  }

  function resetSession() {
    ready = false;
    generation += 1;
    lastSceneKey = '';
    parameterValues = [];
    mouth = null;
    lastInjectionAt = Number.NEGATIVE_INFINITY;
    items.reset();
    catalog = { model: null, hotkeys: [], parameters: [], permissions: [] };
    capabilities = { hotkeys: false, parameters: false, items: false, modelDetection: false, processControl: false };
  }

  function scheduleReconnect() {
    if (!running || reconnectTimer) return;
    const delay = reconnectDelay(attempt++, reconnectBaseMs, reconnectMaxMs);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
    reconnectTimer.unref?.();
  }

  client.onClose(() => {
    resetSession();
    if (running) {
      warnOnce('connection', 'VTS desconectado; el bridge sigue activo y reintentara la conexion');
      scheduleReconnect();
    }
  });

  async function refresh() {
    if (refreshing || !client.connected) return;
    refreshing = true;
    const session = generation;
    try {
      const model = await client.request('CurrentModelRequest');
      if (session !== generation) return;
      if (model.modelID !== catalog.model?.modelID || model.modelLoaded !== catalog.model?.modelLoaded) {
        lastSceneKey = '';
        parameterValues = [];
        mouth = null;
        catalog = { ...catalog, model, hotkeys: [], parameters: [] };
        capabilities = { ...capabilities, hotkeys: false, parameters: false };
        revision += 1;
      }
      const results = await Promise.allSettled([
        client.request('HotkeysInCurrentModelRequest'),
        client.request('InputParameterListRequest'),
        client.request('PermissionRequest', { requestedPermission: '' })
      ]);
      if (session !== generation) return;
      const data = results.map((result, index) => {
        if (result.status === 'fulfilled') return result.value;
        warnOnce(`discovery:${index}`, 'VTS: una consulta de capacidades fallo; se omite esa funcion');
        return {};
      });
      // The user may change models while these requests are in flight.
      if (data.slice(0, 2).some((value) =>
        (value.modelID && value.modelID !== model.modelID) ||
        (value.modelLoaded !== undefined && value.modelLoaded !== model.modelLoaded))) {
        parameterValues = [];
        mouth = null;
        catalog = { ...catalog, hotkeys: [], parameters: [] };
        capabilities = { ...capabilities, hotkeys: false, parameters: false };
        revision += 1;
        return;
      }
      const previous = JSON.stringify({
        model: [catalog.model?.modelID, catalog.model?.modelLoaded],
        hotkeys: catalog.hotkeys, parameters: catalog.parameters, permissions: catalog.permissions
      });
      catalog = {
        model,
        hotkeys: data[0].availableHotkeys ?? [],
        parameters: [...(data[1].defaultParameters ?? []), ...(data[1].customParameters ?? [])]
          .map(({ name, min, max, defaultValue }) => ({ name, min, max, defaultValue })),
        permissions: data[2].permissions ?? []
      };
      capabilities = {
        hotkeys: Boolean(model.modelLoaded && catalog.hotkeys.length),
        parameters: Boolean(model.modelLoaded && catalog.parameters.length),
        items: catalog.permissions.some((p) => p.name === 'LoadCustomImagesAsItems' && p.granted),
        modelDetection: true, processControl: false
      };
      if (!model.modelLoaded) warnOnce('model', 'VTS: no hay un modelo cargado; carga uno para ver a Alba');
      const current = JSON.stringify({
        model: [catalog.model?.modelID, catalog.model?.modelLoaded],
        hotkeys: catalog.hotkeys, parameters: catalog.parameters, permissions: catalog.permissions
      });
      if (current !== previous) revision += 1;
    } finally {
      refreshing = false;
    }
  }

  async function inject({ force = false } = {}) {
    const policy = injectionPolicy();
    if (injecting || refreshing || !ready || !capabilities.parameters || !policy.allowed) return;
    if (!force && Date.now() - lastInjectionAt < policy.intervalMs) return;
    // While asleep, only the scene's fixed pose may be renewed, never speech.
    const currentMouth = policy.asleep ? null : mouth;
    const currentParameters = parameterValues;
    const values = new Map(parameterValues.map((parameter) => [parameter.id, parameter]));
    if (currentMouth) values.set(currentMouth.id, currentMouth);
    if (!values.size) return;
    injecting = true;
    lastInjectionAt = Date.now();
    const session = generation;
    try {
      await client.request('InjectParameterDataRequest', { mode: 'set', parameterValues: [...values.values()] });
      if (currentMouth?.value === 0 && mouth === currentMouth) mouth = null;
    } catch (err) {
      if (session === generation) {
        if (parameterValues === currentParameters) parameterValues = [];
        if (mouth === currentMouth) mouth = null;
        warnOnce(`inject:${err.code}`, 'VTS: no se pudieron inyectar parametros; se libera el control');
      }
    } finally {
      injecting = false;
    }
  }

  async function render() {
    if (!ready || refreshing || !desired) return;
    if (renderTask) return renderTask;
    renderTask = (async () => {
      while (ready && !refreshing && desired && renderedRevision !== revision) {
        const currentRevision = revision;
        const session = generation;
        const { state, context } = desired;
        const plan = translateScene(state.effective, context, catalog, warnOnce);
        const policy = injectionPolicy();
        const sceneKey = JSON.stringify([catalog.model?.modelID, state.effective, state.asleep, plan.hotkey, plan.parameters, policy]);
        const isCurrent = () => ready && session === generation && currentRevision === revision;
        if (sceneKey !== lastSceneKey) {
          parameterValues = [];
          let hotkeyApplied = false;
          if (plan.hotkey) {
            try {
              await client.request('HotkeyTriggerRequest', { hotkeyID: plan.hotkey.hotkeyID });
              hotkeyApplied = true;
            } catch (err) {
              warnOnce(`trigger:${plan.hotkey.hotkeyID}:${err.code}`, 'VTS: no se pudo ejecutar el hotkey; uso parametros');
            }
          }
          if (!isCurrent()) continue;
          lastSceneKey = sceneKey;
          parameterValues = !policy.allowed || hotkeyApplied ? [] : plan.parameters;
          await inject({ force: true });
        }
        if (!isCurrent()) continue;
        await items.sync(state.asleep ? [] : state.props ?? [], context.assets ?? {}, capabilities.items, isCurrent);
        if (isCurrent()) renderedRevision = currentRevision;
      }
    })().catch((err) => {
      warnOnce(`render:${err.code ?? err.name}`, 'VTS: no se pudo aplicar la escena; el bridge sigue activo');
    }).finally(() => { renderTask = null; });
    return renderTask;
  }

  async function connect() {
    running = true;
    if (connectionTask) return connectionTask;
    if (ready) return true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (!refreshTimer) {
      refreshTimer = setInterval(() => {
        if (!ready || refreshing) return;
        void refresh().then(render).catch(async () => {
          warnOnce('refresh', 'VTS: se perdio el estado del modelo; reconectando');
          await client.disconnect();
        });
      }, refreshIntervalMs);
      refreshTimer.unref?.();
      injectionTimer = setInterval(() => { void inject(); }, injectionIntervalMs);
      injectionTimer.unref?.();
    }
    connectionTask = (async () => {
      try {
        await client.connect();
        await auth.authenticate(client);
        if (!running) return false;
        if (requestItemPermission && !permissionAsked) {
          permissionAsked = true;
          try {
            await client.request('PermissionRequest', { requestedPermission: 'LoadCustomImagesAsItems' }, { timeoutMs: authTimeoutMs });
          } catch {
            warnOnce('permission-request', 'VTS: no se concedio el permiso de imagenes; props omitidos');
          }
        }
        await refresh();
        if (!running || !client.connected) return false;
        ready = true;
        attempt = 0;
        logger.log('VTS conectado y autenticado');
        await render();
        return true;
      } catch (err) {
        warnOnce(`connect:${err.code}`, `VTS: ${err.message}`);
        await client.disconnect();
        scheduleReconnect();
        return false;
      } finally {
        connectionTask = null;
      }
    })();
    return connectionTask;
  }

  function applyState(state, context = {}) {
    const previous = desired?.state;
    desired = { state: structuredClone(state), context };
    revision += 1;
    // Cancel an old pose immediately, including while discovery/render is busy.
    // An unrelated config reload must not erase an unchanged sleeping pose.
    if (previous?.effective !== state.effective || previous?.asleep !== state.asleep || previous?.deepSleep !== state.deepSleep) {
      parameterValues = [];
      lastSceneKey = '';
      lastInjectionAt = Number.NEGATIVE_INFINITY;
    }
    if (state.asleep || previous?.asleep) {
      mouth = null;
    }
    items.retry();
    return render();
  }

  function setMouth(value) {
    if (!ready || desired?.state.asleep || !Number.isFinite(value)) return;
    const binding = selectBinding(desired?.context.bindings, catalog.model);
    const result = translateParameters({ mouth: value }, binding, catalog.parameters, warnOnce);
    mouth = result[0] ?? null;
    void inject({ force: true });
  }

  async function disconnect() {
    running = false;
    clearTimeout(reconnectTimer);
    clearInterval(refreshTimer);
    clearInterval(injectionTimer);
    reconnectTimer = refreshTimer = injectionTimer = null;
    resetSession();
    await client.disconnect();
    await connectionTask;
    await renderTask;
  }

  return {
    name: 'vts', connect, disconnect, applyState, setMouth,
    speak() {}, // The core speech service supplies synthetic mouth frames.
    async refresh() { await refresh(); await render(); },
    get connected() { return ready; },
    get capabilities() { return { ...capabilities }; },
    getStatus() {
      return structuredClone({ connected: ready, ...catalog, capabilities, props: items.list() });
    }
  };
}
