import { normalizeEvent, validateIntent, EventError } from './core/events.mjs';
import { createRulesEngine } from './core/rules-engine.mjs';
import { createDirector } from './core/director.mjs';
import { createSpeech } from './core/speech.mjs';
import { createActivity } from './core/activity.mjs';
import { createPhrasebook } from './core/phrases.mjs';
import { createSpeechQueue } from './core/speech-queue.mjs';

// Si opencode responde algo muy largo, Alba dice hasta este numero de
// caracteres por turno y luego avisa que el resto esta en opencode.
const DEFAULT_RESPONSE_MAX_CHARS = 900;
const LONG_RESPONSE_FALLBACK = 'El resto te lo dejé escrito en opencode.';

// Orchestration shared by HTTP and the demo. Client identities do not affect behavior.
export function createApp({ config: initial, adapter, processControl, now = Date.now, random = Math.random, timers = {} }) {
  let config = initial;
  let rules = createRulesEngine({ rules: config.rules, now });
  const director = createDirector({ scenes: config.scenes, persona: config.persona, now });
  const speech = createSpeech({ onFrame: (value) => adapter.setMouth(value) });
  const activity = createActivity({ now });
  const phrasebook = createPhrasebook({ config: config.phrases, random, now });
  let lastEffective = null;
  let wasAsleep = false;
  let deferred = null;
  let turnChars = 0;
  let limitNoticed = false;

  // Todo lo que dice Alba pasa por esta cola, a ritmo de lectura.
  const voice = createSpeechQueue({
    setTimer: timers.setTimer, clearTimer: timers.clearTimer,
    onSay(text) {
      adapter.speak({ text });
      phrasebook.noteSpoken();
      // En answering la boca ya se mueve en bucle; si no, lip-sync de la frase.
      if (!speech.isLooping() && !director.getState().asleep) speech.speak({ text });
    },
    // Termino de hablar: ahora si vuelve a reposo si opencode ya habia terminado.
    onDone() {
      if (!deferred || director.getState().asleep) { deferred = null; return; }
      const { intent, props } = deferred;
      deferred = null;
      director.applyIntent(intent, { props });
    }
  });

  function newTurn() {
    voice.clear();
    deferred = null;
    turnChars = 0;
    limitNoticed = false;
  }

  // Alba dice algo propio al cambiar de escena (si toca, segun phrases.json).
  function sayPhrase(state) {
    let key = null;
    if (wasAsleep && !state.asleep) key = 'wake';
    else if (!wasAsleep && state.asleep) key = 'sleep';
    else if (lastEffective !== null && state.effective !== lastEffective) key = state.effective;
    lastEffective = state.effective;
    wasAsleep = state.asleep;
    if (key === 'sleep') newTurn();
    // Mientras dice la respuesta de opencode, sus frases propias esperan.
    if (!key || speech.isLooping() || voice.busy) return;
    const line = phrasebook.pick(key);
    if (line) voice.enqueue(line);
  }

  // Frase de la respuesta del agente (o de avatar_say).
  function sayResponse(text) {
    const clean = String(text ?? '').trim();
    if (!clean) return { queued: false };
    const limit = config.phrases?.settings?.responseMaxChars ?? DEFAULT_RESPONSE_MAX_CHARS;
    turnChars += [...clean].length;
    if (limit > 0 && turnChars > limit) {
      if (!limitNoticed) {
        limitNoticed = true;
        voice.enqueue(phrasebook.pick('long_response', now(), { force: true }) ?? LONG_RESPONSE_FALLBACK);
      }
      return { queued: false, reason: 'response-limit' };
    }
    voice.enqueue(clean);
    return { queued: true };
  }

  const applyState = (state) => {
    if (state.asleep) speech.stop();
    adapter.applyState(state, { scenes: config.scenes, bindings: config.bindings, assets: config.assets });
    // Escenas con lipSync (p. ej. answering) mueven la boca mientras duran.
    const scene = config.scenes?.scenes?.[state.effective];
    if (scene?.lipSync && !state.asleep) speech.loop();
    else speech.stopLoop();
    sayPhrase(state);
  };
  director.onChange(applyState);
  applyState(director.getState());
  let pending = Promise.resolve();
  const serialize = (action) => {
    const result = pending.then(action);
    pending = result.catch(() => {});
    return result;
  };
  function getState() {
    return { ...director.getState(), commands: config.commands.commands, intents: director.listIntents(),
      limits: config.persona.limits, adapter: { name: adapter.name,
        ...(adapter.getStatus?.() ?? { connected: adapter.connected, capabilities: adapter.capabilities }) },
      processControl: processControl?.status ?? { canClose: false, canLaunch: false },
      events: activity.snapshot() };
  }
  function handleEvent(raw) {
    return serialize(() => {
      const event = normalizeEvent(raw);
      const asleep = director.getState().asleep;
      activity.record(event, { ignored: asleep });
      if (asleep) return { event, ignored: true, reason: 'asleep', decision: null };
      if (event.type === 'say') {
        const spoken = sayResponse(event.text);
        return { event, decision: null, speech: { queued: spoken.queued, pending: voice.pending },
          ...(spoken.reason ? { ignored: true, reason: spoken.reason } : {}) };
      }
      // Mensaje nuevo: lo que quedaba por decir del turno anterior ya no vale.
      if (event.type === 'session.busy' || event.type === 'session.start') newTurn();
      const decision = rules.evaluate(event, now(), director.getState());
      // Automatic rules can pause Alba, but cannot authorize process operations.
      if (decision?.intent === 'deep_sleep') return { event, decision, ignored: true, reason: 'confirmation-required' };
      // opencode termino pero Alba sigue hablando: vuelve a reposo al terminar la frase.
      if (decision && event.type === 'session.idle' && voice.busy) {
        deferred = { intent: decision.intent, props: decision.args?.props };
        return { event, decision, deferred: true };
      }
      if (decision) deferred = null;
      const applied = decision ? director.applyIntent(decision.intent, { props: decision.args?.props }) : null;
      return { event, decision, applied };
    });
  }
  function handleIntent(raw) {
    return serialize(async () => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new EventError('intencion invalida');
      let command;
      if (raw.command !== undefined) {
        if (typeof raw.command !== 'string' || !Object.hasOwn(config.commands.commands, raw.command)) throw new EventError('comando desconocido');
        command = config.commands.commands[raw.command];
      }
      const intent = validateIntent(command?.intent ?? raw.intent, director.listIntents());
      const props = command ? command.args?.props : raw.props;
      if (props !== undefined && props !== null && (!Array.isArray(props) || props.some((id) => typeof id !== 'string'))) throw new EventError('props debe ser una lista de ids');
      const state = director.getState();
      const launch = intent === 'wake' && state.deepSleep && processControl?.status.canLaunch;
      if ((command?.confirm || intent === 'deep_sleep' || launch) && raw.confirmed !== true) {
        throw Object.assign(new Error('Se requiere confirmacion explicita del usuario'), { statusCode: 409 });
      }
      let notice;
      if (intent === 'deep_sleep') {
        if (processControl?.status.canClose) await processControl.close({ confirmed: true });
        else notice = adapter.name === 'pngtuber'
          ? 'Control de procesos desactivado: Alba se pausa; la ventana sigue abierta'
          : 'Control de procesos desactivado: Alba se pausa; VTS sigue abierto';
      }
      if (launch) await processControl.launch({ confirmed: true });
      else if (intent === 'wake' && state.deepSleep) notice = adapter.name === 'pngtuber'
        ? 'Alba vuelve a idle; la ventana sigue abierta'
        : 'Abre VTube Studio manualmente; Alba reconecta cuando aparezca';
      // Disabled process control degrades to ordinary sleep without claiming VTS closed.
      const effectiveIntent = intent === 'deep_sleep' && !processControl?.status.canClose ? 'sleep' : intent;
      const applied = director.applyIntent(effectiveIntent, { props });
      return { intent, applied, ...(notice ? { notice } : {}) };
    });
  }
  return {
    getState, handleEvent, handleIntent, tick: director.tick,
    onChange: (listener) => director.onChange(() => listener(getState())),
    updateConfig(next) {
      config = next;
      rules = createRulesEngine({ rules: next.rules, now });
      phrasebook.update(next.phrases);
      const before = JSON.stringify(director.getState());
      director.updateConfig({ scenes: next.scenes, persona: next.persona });
      if (JSON.stringify(director.getState()) === before) applyState(director.getState());
    },
    stop: () => { voice.clear(); speech.stop(); }
  };
}
