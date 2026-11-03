import { createState } from './state.mjs';
import { warnOnce } from './log.mjs';

const TRANSIENT_DEFAULT_MS = 2500;

function unique(values) {
  return [...new Set(values)];
}

export function createDirector({ scenes = {}, persona = {}, now = () => Date.now() } = {}) {
  let sceneMap = scenes.scenes ?? scenes;
  let limits = persona.limits ?? {};
  let minStateDurationMs = limits.minStateDurationMs ?? 1200;
  let maxTransientsPerMinute = limits.maxTransientsPerMinute ?? 6;

  let base = 'idle';
  let activity = null;
  let transient = null;
  let manualProps = [];
  let asleep = false;
  let deepSleep = false;
  let lastActivityChangeAt = Number.NEGATIVE_INFINITY;
  let transientTimes = [];

  const store = createState(snapshot());

  function sceneFor(intent) {
    return sceneMap[intent] ?? null;
  }

  function sceneProps(sceneId) {
    const scene = sceneMap[sceneId];
    return Array.isArray(scene?.props) ? scene.props : [];
  }

  function snapshot(at = now()) {
    const effective = transient?.scene ?? activity ?? base;
    const props = asleep ? [] : unique([
      ...sceneProps(base), ...sceneProps(activity), ...sceneProps(transient?.scene), ...manualProps
    ]);
    return {
      asleep,
      deepSleep,
      base,
      activity,
      transient: transient ? { ...transient } : null,
      effective,
      props,
      updatedAt: at
    };
  }

  function publish(at = now()) {
    const next = snapshot(at);
    const previous = store.get();
    if (JSON.stringify(previous) === JSON.stringify(next)) return next;
    store.set(next);
    return next;
  }

  function applyIntent(intent, options = {}) {
    const at = options.now ?? now();
    const requestedProps = Array.isArray(options.props) ? options.props : null;

    if (asleep && intent !== 'wake') {
      return { applied: false, reason: 'asleep', state: store.get() };
    }

    if (intent === 'wake') {
      asleep = false;
      deepSleep = false;
      activity = null;
      transient = null;
      manualProps = [];
      base = 'idle';
      lastActivityChangeAt = at;
      return { applied: true, state: publish(at) };
    }

    if (intent === 'sleep' || intent === 'deep_sleep') {
      asleep = true;
      deepSleep = intent === 'deep_sleep';
      activity = null;
      transient = null;
      manualProps = [];
      base = sceneFor(intent) ? intent : 'sleep';
      lastActivityChangeAt = at;
      return { applied: true, state: publish(at) };
    }

    let sceneId = intent;
    if (!sceneFor(sceneId)) {
      warnOnce(`scene-missing:${intent}`, `no hay escena para la intencion ${intent}; uso idle`);
      sceneId = 'idle';
    }
    const scene = sceneMap[sceneId] ?? {};
    const layer = scene.layer ?? 'activity';

    if (layer === 'transient') {
      transientTimes = transientTimes.filter((timestamp) => at - timestamp < 60000);
      if (transientTimes.length >= maxTransientsPerMinute) {
        return { applied: false, reason: 'transient-limit', state: store.get() };
      }
      transientTimes.push(at);
      const durationMs = scene.durationMs ?? TRANSIENT_DEFAULT_MS;
      transient = { scene: sceneId, expiresAt: at + durationMs };
    } else if (layer === 'activity') {
      if (activity !== sceneId && at - lastActivityChangeAt < minStateDurationMs) {
        return { applied: false, reason: 'min-duration', state: store.get() };
      }
      activity = sceneId;
      lastActivityChangeAt = at;
    } else {
      base = sceneId;
      activity = null;
      lastActivityChangeAt = at;
    }

    if (requestedProps) manualProps = requestedProps;
    return { applied: true, state: publish(at) };
  }

  function tick(at = now()) {
    if (transient && at >= transient.expiresAt) {
      transient = null;
      return publish(at);
    }
    return store.get();
  }

  function getState() {
    return structuredClone(store.get());
  }

  function onChange(listener) {
    return store.subscribe(listener);
  }

  function listIntents() {
    return unique([...Object.keys(sceneMap), 'wake']);
  }

  function updateConfig({ scenes: nextScenes, persona: nextPersona } = {}) {
    if (nextScenes) sceneMap = nextScenes.scenes ?? nextScenes;
    if (nextPersona) {
      limits = nextPersona.limits ?? {};
      minStateDurationMs = limits.minStateDurationMs ?? 1200;
      maxTransientsPerMinute = limits.maxTransientsPerMinute ?? 6;
    }
    return publish();
  }

  return { applyIntent, tick, getState, onChange, listIntents, updateConfig };
}
