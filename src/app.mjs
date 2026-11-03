import { normalizeEvent, validateIntent, EventError } from './core/events.mjs';
import { createRulesEngine } from './core/rules-engine.mjs';
import { createDirector } from './core/director.mjs';
import { createSpeech } from './core/speech.mjs';

// Orchestration shared by HTTP and the demo. Client identities do not affect behavior.
export function createApp({ config: initial, adapter, processControl, now = Date.now }) {
  let config = initial;
  let rules = createRulesEngine({ rules: config.rules, now });
  const director = createDirector({ scenes: config.scenes, persona: config.persona, now });
  const speech = createSpeech({ onFrame: (value) => adapter.setMouth(value) });
  const applyState = (state) => {
    if (state.asleep) speech.stop();
    adapter.applyState(state, { scenes: config.scenes, bindings: config.bindings, assets: config.assets });
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
      processControl: processControl?.status ?? { canClose: false, canLaunch: false } };
  }
  function handleEvent(raw) {
    return serialize(() => {
      const event = normalizeEvent(raw);
      if (director.getState().asleep) return { event, ignored: true, reason: 'asleep', decision: null };
      if (event.type === 'say') {
        adapter.speak({ text: event.text ?? '' });
        const result = speech.speak({ text: event.text ?? '' });
        return { event, speech: { durationMs: result.durationMs, synthetic: result.synthetic }, decision: null };
      }
      const decision = rules.evaluate(event, now(), director.getState());
      // Automatic rules can pause Alba, but cannot authorize process operations.
      if (decision?.intent === 'deep_sleep') return { event, decision, ignored: true, reason: 'confirmation-required' };
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
        else notice = 'Control de procesos desactivado: Alba se pausa; VTS sigue abierto';
      }
      if (launch) await processControl.launch({ confirmed: true });
      else if (intent === 'wake' && state.deepSleep) notice = 'Abre VTube Studio manualmente; Alba reconecta cuando aparezca';
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
      director.updateConfig({ scenes: next.scenes, persona: next.persona });
    },
    stop: () => speech.stop()
  };
}
