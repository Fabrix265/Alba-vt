// Frases cortas para el registro de eventos (ALBA_LOG_EVENTS=true).
const REASONS = {
  asleep: 'ignorado: Alba duerme',
  'min-duration': 'aplazado (minStateDurationMs)',
  'transient-limit': 'descartado: demasiadas reacciones por minuto (maxTransientsPerMinute)',
  'confirmation-required': 'ignorado: deep_sleep requiere confirmacion',
  'response-limit': 'no lo dice: la respuesta supera responseMaxChars'
};

export function describeApplied(applied, intent) {
  if (!applied) return intent ?? 'sin cambios';
  const scene = applied.state?.effective;
  if (applied.applied === false) return `${intent ?? scene}: ${REASONS[applied.reason] ?? applied.reason}`;
  return `escena ${scene}`;
}

export function describeEvent({ event, decision, applied, ignored, reason, deferred } = {}) {
  const tool = event?.tool ? ` (${event.tool})` : '';
  const ok = event?.ok === false ? ' fallo' : '';
  const head = `${event?.source ?? '?'} ${event?.type ?? '?'}${tool}${ok}`;
  if (ignored) return `${head} -> ${REASONS[reason] ?? reason}`;
  if (event?.type === 'say') {
    const text = String(event.text ?? '');
    return `${head} -> dice "${text.length > 70 ? `${text.slice(0, 69)}…` : text}"`;
  }
  if (deferred) return `${head} -> regla ${decision.rule} -> ${decision.intent} cuando termine de hablar`;
  if (!decision) return `${head} -> sin regla (no cambia nada)`;
  return `${head} -> regla ${decision.rule} -> ${describeApplied(applied, decision.intent)}`;
}
