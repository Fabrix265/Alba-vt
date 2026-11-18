import { createSentenceStream } from './sentences.mjs';

// Traduce eventos de opencode al esquema canonico. Cruzan el tipo de evento y
// el nombre de la herramienta; nunca argumentos, salidas de comandos, tus
// mensajes ni errores. Con speakResponses, ademas, las frases de la respuesta
// del agente (sin codigo) para que Alba las diga: solo viajan al bridge local.
//
// opencode emite un message.part.updated por cada trozo de texto que escribe.
// El traductor recuerda que partes ya anuncio para enviar un solo evento por
// cambio de fase (empieza a pensar, empieza a responder, termina...). No decide
// que hace Alba: eso lo deciden las reglas de config/rules.json.

const MAX_TRACKED = 500;

function canonical(type, tool = null, ok = null, text = null) {
  return { source: 'opencode', type, tool, ok, text, meta: {} };
}

// Set/Map con tamano acotado para sesiones largas.
function remember(collection, key, value) {
  if (collection instanceof Map) collection.set(key, value);
  else collection.add(key);
  if (collection.size > MAX_TRACKED) collection.delete(collection.keys().next().value);
}

export function createTranslator({ speakResponses = false } = {}) {
  const streams = new Map();
  const roles = new Map();
  const announced = new Set();
  const answering = new Set();
  const busy = new Map();
  // Ultima fase anunciada por sesion, para no repetir "pensando" dos veces seguidas.
  const phase = new Map();

  function sessionState(sessionID, next) {
    const key = sessionID ?? '?';
    if (busy.get(key) === next) return false;
    remember(busy, key, next);
    return true;
  }

  function fromPart(part) {
    if (!part || typeof part !== 'object') return null;
    const id = typeof part.id === 'string' ? part.id : null;
    if (part.type === 'tool' && part.state?.status === 'error') {
      return canonical('error', typeof part.tool === 'string' ? part.tool : null, false);
    }
    // Un paso nuevo del modelo o un bloque de razonamiento = esta pensando.
    if (part.type === 'step-start' || part.type === 'reasoning') {
      if (!id || announced.has(id)) return null;
      remember(announced, id);
      if (phase.get(part.sessionID) === 'reasoning') return null;
      remember(phase, part.sessionID, 'reasoning');
      return canonical('reasoning');
    }
    if (part.type === 'text') {
      if (part.synthetic || part.ignored || !id) return null;
      const role = roles.get(part.messageID);
      // El texto del usuario tambien llega como parte; solo cuenta el del agente.
      if (role === 'user' || (role === undefined && !part.time?.start)) return null;
      const ended = part.time?.end !== undefined && part.time?.end !== null;
      const events = [];
      if (!announced.has(id)) {
        if (ended) return null;
        remember(announced, id);
        remember(answering, id);
        remember(phase, part.sessionID, 'response');
        events.push(canonical('response.start'));
      }
      if (!answering.has(id)) return events.length ? events : null;
      if (speakResponses) {
        if (!streams.has(id)) remember(streams, id, createSentenceStream());
        for (const sentence of streams.get(id)(part.text, { final: ended })) {
          events.push(canonical('say', null, null, sentence));
        }
      }
      if (ended) {
        answering.delete(id);
        streams.delete(id);
        events.push(canonical('response.end'));
      }
      return events.length ? events : null;
    }
    return null;
  }

  function fromEvent(event) {
    const properties = event?.properties ?? {};
    switch (event?.type) {
      case 'session.created':
        return canonical('session.start');
      case 'session.status': {
        const status = properties.status?.type;
        if (status === 'busy') return sessionState(properties.sessionID, 'busy') ? canonical('session.busy') : null;
        if (status === 'idle') {
          phase.delete(properties.sessionID);
          return sessionState(properties.sessionID, 'idle') ? canonical('session.idle') : null;
        }
        return null;
      }
      case 'session.idle':
        return sessionState(properties.sessionID, 'idle') ? canonical('session.idle') : null;
      case 'session.error':
        return canonical('error', null, false);
      case 'message.updated': {
        const info = properties.info;
        if (typeof info?.id === 'string' && typeof info.role === 'string') remember(roles, info.id, info.role);
        return null;
      }
      case 'message.part.updated':
        return fromPart(properties.part);
      default:
        return null;
    }
  }

  return function translate(hook, input = {}, output = {}) {
    const tool = typeof input.tool === 'string' ? input.tool : null;
    if (hook === 'tool.execute.before') {
      remember(phase, input.sessionID, 'tool');
      return canonical('tool.start', tool);
    }
    if (hook === 'tool.execute.after') {
      const failed = output.metadata?.exit !== undefined && output.metadata.exit !== 0;
      return canonical(failed ? 'error' : 'tool.end', tool, !failed);
    }
    if (hook === 'event') return fromEvent(input.event);
    return null;
  };
}

// Traductor por defecto (una instancia por proceso de opencode). Devuelve un
// evento, una lista de eventos o null.
export const translate = createTranslator();
