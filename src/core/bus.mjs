export function createBus() {
  const listeners = new Map();

  function on(type, handler) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    return () => listeners.get(type)?.delete(handler);
  }

  function emit(type, payload) {
    const handlers = listeners.get(type);
    if (!handlers) return 0;
    let delivered = 0;
    for (const handler of [...handlers]) {
      handler(payload);
      delivered += 1;
    }
    return delivered;
  }

  function clear() {
    listeners.clear();
  }

  return { on, emit, clear };
}
