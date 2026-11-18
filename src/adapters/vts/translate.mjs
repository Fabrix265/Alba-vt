const lower = (value) => String(value ?? '').toLowerCase();

export function selectBinding(bindings = {}, model = {}) {
  const entries = Object.entries(bindings.models ?? {});
  const match = (value) => value && entries.find(([key, binding]) =>
    [key, ...(binding.match ?? [])].some((candidate) => lower(candidate) === lower(value)));
  const selected = match(model.modelID) ?? match(model.modelName);
  const base = bindings.default ?? {};
  const override = selected?.[1] ?? {};
  return {
    key: selected?.[0] ?? 'default',
    hotkeys: { ...base.hotkeys, ...override.hotkeys },
    parameters: { ...base.parameters, ...override.parameters }
  };
}

export function translateParameters(values, binding, available, warn = () => {}) {
  const result = new Map();
  for (const [alias, value] of Object.entries(values ?? {})) {
    const id = binding.parameters[alias];
    const parameter = available.find((entry) => entry.name === id);
    if (!id || !parameter) {
      warn(`parameter:${binding.key}:${alias}`, `VTS: el binding ${alias} no tiene un parametro de entrada disponible`);
      continue;
    }
    if (!Number.isFinite(value)) continue;
    const min = Math.max(-1000000, parameter.min ?? -1000000);
    const max = Math.min(1000000, parameter.max ?? 1000000);
    result.set(id, { id, value: Math.max(min, Math.min(max, value)) });
  }
  return [...result.values()];
}

export function translateScene(intent, { scenes = {}, bindings = {} }, catalog, warn = () => {}) {
  const binding = selectBinding(bindings, catalog.model);
  const sceneMap = scenes.scenes ?? scenes;
  const scene = sceneMap[intent] ?? {};
  if (!catalog.model?.modelLoaded) return { binding, hotkey: null, parameters: [] };
  const reference = binding.hotkeys[intent] ?? binding.hotkeys[scene.hotkey] ?? scene.hotkey;
  const hotkey = catalog.hotkeys.find((entry) => entry.hotkeyID === reference) ??
    catalog.hotkeys.find((entry) => reference && lower(entry.name) === lower(reference));
  if (reference && !hotkey) {
    warn(`hotkey:${catalog.model.modelID}:${reference}`, `VTS: falta el hotkey para ${intent}; uso parametros disponibles`);
  }
  let parameters = translateParameters(scene.parameters, binding, catalog.parameters, warn);
  if (parameters.length === 0 && intent !== 'idle') {
    if (!hotkey) warn(`scene:${catalog.model.modelID}:${intent}`, `VTS: ${intent} sin hotkey ni parametros; uso idle`);
    parameters = translateParameters(sceneMap.idle?.parameters, binding, catalog.parameters, warn);
  }
  return { binding, hotkey: hotkey ?? null, parameters };
}