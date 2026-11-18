export const EVENT_TYPES = Object.freeze([
  'tool.start',
  'tool.end',
  'session.idle',
  'session.start',
  'error',
  'say',
  'custom'
]);

const EVENT_TYPE_SET = new Set(EVENT_TYPES);

export class EventError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EventError';
  }
}

export function normalizeEvent(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EventError('el evento debe ser un objeto');
  }
  if (typeof input.type !== 'string' || !EVENT_TYPE_SET.has(input.type)) {
    throw new EventError(`type debe ser uno de: ${EVENT_TYPES.join(', ')}`);
  }
  if (input.source !== undefined && typeof input.source !== 'string') {
    throw new EventError('source debe ser texto');
  }
  if (input.tool !== undefined && input.tool !== null && typeof input.tool !== 'string') {
    throw new EventError('tool debe ser texto');
  }
  if (input.ok !== undefined && input.ok !== null && typeof input.ok !== 'boolean') {
    throw new EventError('ok debe ser booleano');
  }
  if (input.text !== undefined && input.text !== null && typeof input.text !== 'string') {
    throw new EventError('text debe ser texto');
  }
  if (
    input.meta !== undefined &&
    input.meta !== null &&
    (typeof input.meta !== 'object' || Array.isArray(input.meta))
  ) {
    throw new EventError('meta debe ser un objeto');
  }
  return {
    source: input.source ?? 'unknown',
    type: input.type,
    tool: input.tool ?? null,
    ok: input.ok ?? null,
    text: input.text ?? null,
    meta: input.meta ?? {}
  };
}

export function validateIntent(intent, known) {
  if (typeof intent !== 'string' || intent.length === 0) {
    throw new EventError('intent debe ser texto no vacio');
  }
  const allowed = known instanceof Set ? known : new Set(known ?? []);
  if (allowed.size > 0 && !allowed.has(intent)) {
    throw new EventError(`intent desconocida: ${intent}`);
  }
  return intent;
}
