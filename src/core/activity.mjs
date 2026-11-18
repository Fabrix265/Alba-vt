// Registro de que eventos llegan al bridge y de quien. Sirve para responder
// "¿esta conectado mi agente?" sin guardar el contenido de los eventos.
export const MAX_SOURCES = 16;
const MAX_SOURCE_LENGTH = 64;

export function createActivity({ now = Date.now, maxSources = MAX_SOURCES } = {}) {
  const sources = new Map();
  let total = 0;
  let last = null;

  function record(event, { ignored = false } = {}) {
    const at = now();
    const source = String(event?.source ?? 'unknown').slice(0, MAX_SOURCE_LENGTH);
    const summary = { type: event?.type ?? null, tool: event?.tool ?? null, ok: event?.ok ?? null, ignored, at };
    total += 1;
    last = { source, ...summary };
    const previous = sources.get(source);
    // Reinsertar mantiene el Map ordenado del menos al mas reciente.
    sources.delete(source);
    sources.set(source, { count: (previous?.count ?? 0) + 1, firstAt: previous?.firstAt ?? at, last: summary });
    while (sources.size > maxSources) sources.delete(sources.keys().next().value);
  }

  function snapshot() {
    const at = now();
    const age = (value) => (value === null || value === undefined ? null : Math.max(0, at - value));
    return {
      total,
      lastEvent: last ? { ...last, agoMs: age(last.at) } : null,
      sources: Object.fromEntries([...sources].reverse().map(([source, entry]) => [source, {
        count: entry.count,
        firstAt: entry.firstAt,
        last: { ...entry.last, agoMs: age(entry.last.at) }
      }]))
    };
  }

  return { record, snapshot };
}
